const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  AudioPlayerStatus
} = require('@discordjs/voice');
const axios = require('axios');
const FormData = require('form-data');
const { convertTextToSpeech } = require('./elevenLabs');

const { generateResponseFromMessages } = require('./textHandler');
const { getClient, getUsername } = require('./utils');
const { opus } = require('prism-media');
const { AUDIO_PROCESSOR_URL } = require('./config');

const client = getClient();

// Function to join voice channel
async function joinVC(voiceChannel, botConfig) {
  if (!voiceChannel) return;

  let isProcessingVoiceRequest = false;

  const connection = getVoiceConnection(voiceChannel.guild.id) || joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log("Bot has joined the voice channel!");
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    console.log("Disconnected from voice channel");
  });

  const receiver = connection.receiver;

  let messages = [];

  // Handle voice activity
  handleVoiceActivity(voiceChannel, receiver, async (audioBuffer, userId) => {
    if (isProcessingVoiceRequest) {
      console.log("Already processing a voice request");
      return null;
    }

    isProcessingVoiceRequest = true;

    // Format messages
    const username = await getUsername(userId);

    try {
      // Get transcribed audio and add to messages
      const transcribedAudio = await transcribeAudio(audioBuffer);
      console.log("Transcribed audio:", transcribedAudio);

      if (!transcribedAudio || transcribedAudio.length <= 0) {
        console.error("Error transcribing audio");
        return null;
      }

      messages.push({ role: 'user', name: username, content: transcribedAudio });
      messages = messages.slice(-botConfig.context_size);

      // Generate bot response
      const textRespose = await generateResponseFromMessages(messages, botConfig);
      console.log("Bot response:", textRespose);

      if (!textRespose || textRespose.length <= 0) {
        console.error("Error generating bot response");
        return null;
      }

      // Add bot response to messages
      messages.push({ role: 'assistant', name: botConfig.name, content: textRespose });
      messages = messages.slice(-botConfig.context_size);

      // Convert text to speech
      const responseAudioStream = await convertTextToSpeech(textRespose, botConfig);

      if (!responseAudioStream) {
        console.error("Error converting text to speech");
        return null;
      }

      // Play audio stream
      const player = playAudioStream(connection, responseAudioStream);

      // Wait for the audio stream to finish playing
      await player.on(AudioPlayerStatus.Idle, () => {
        console.log("Audio playback finished");
      });
    } catch (error) {
      console.error("Error in handleVoiceActivity:", error.response ? error.response.data : error.message);
    } finally {
      isProcessingVoiceRequest = false;
    }
  });
}

async function transcribeAudio(audioBuffer) {
  try {
    // Create a FormData instance
    const formData = new FormData();
    
    // Append the audio buffer as a file
    formData.append('file', audioBuffer, {
      filename: 'audio.opus',
      contentType: 'audio/opus',
    });

    // Send the request
    const response = await axios.post(AUDIO_PROCESSOR_URL + '/transcribe-audio/', formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    if (response.data && response.data.transcription) {
      return response.data.transcription;
    } else {
      console.error('Unexpected response format:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Error in transcribeAudio:', error.response ? error.response.data : error.message);
    return null;
  }
}

function playFile(connection, filePath) {
  const player = createAudioPlayer();
  const resource = createAudioResource(filePath);
  player.play(resource);
  connection.subscribe(player);
  return player;
}

function playAudioStream(connection, audioStream) {
  if (!audioStream) {
    console.error('Invalid audio stream');
    return null;
  }

  try {
    const resource = createAudioResource(audioStream, {
      inputType: 'arbitrary',
      inlineVolume: true
    });

    const player = createAudioPlayer();
    player.play(resource);

    player.on('error', error => {
      console.error('Error playing audio:', error);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('Audio playback finished');
    });

    connection.subscribe(player);
    return player;
  } catch (error) {
    console.error('Error creating audio player:', error);
    return null;
  }
}

function handleVoiceActivity(voiceChannel, receiver, audioProcessor) {
  receiver.speaking.on('start', async (userId) => {
    // Get member count
    const peopleCount = voiceChannel.members.size - 1;

    if (peopleCount > 8) {
      console.log("Too many people in voice channel");
      
      // Mute the bot
      const botMember = voiceChannel.members.find(member => member.user.id === client.user.id);
      if (botMember && !botMember.voice.mute) {
       await botMember.voice.setMute(true);
      }

      return;
    } else {
      // Unmute the bot
      const botMember = voiceChannel.members.find(member => member.user.id === client.user.id);
      if (botMember && botMember.voice.mute) {
        await botMember.voice.setMute(false);
      }
    }

    const rawStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 500 // Adjust this value (in ms) to fine-tune silence detection
      }
    });

    // Decode the audio stream using discordjs OpusEncoder
    const decoder = new opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
    const audioStream = rawStream.pipe(decoder);

    let audioBuffer = [];
    let startTime = Date.now();
    let finished = false;

    audioStream.on('data', (chunk) => {
      if (finished) return;

      audioBuffer.push(chunk);

      if (Date.now() - startTime > 8000) {
        // Manually trigger the end event
        audioStream.emit('end');
      }
    });

    audioStream.on('end', async () => {
      finished = true;
      const audioLength = (Date.now() - startTime);

      //console.log(`User ${userId} stopped speaking`);
      if (audioBuffer.length > 0 && audioLength >= 800) {
        try {
          // Calculate the response probability
          const responseProbability = 1 / peopleCount;

          // Check if we should respond based on the calculated probability
          if (Math.random() <= responseProbability) {
            console.log("Probability check passed, probability:", responseProbability);
            const completeAudioBuffer = Buffer.concat(audioBuffer);
            await audioProcessor(completeAudioBuffer, userId);
          }
        } catch (error) {
          console.error('Error processing audio:', error);
        }
      }
      audioBuffer = [];
    });

    audioStream.on('error', (error) => {
      console.error('Error in audio stream:', error);
      audioBuffer = [];
    });
  });
}

function leaveVC(guild) {
  const connection = getVoiceConnection(guild.id);
  if (connection) {
    connection.destroy();
    console.log("Bot has left the voice channel.");
  }
}

module.exports = {
  joinVC,
  leaveVC
};