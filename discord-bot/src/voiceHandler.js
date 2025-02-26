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
const { Readable } = require('stream');

const { generateResponseFromMessages } = require('./textHandler');
const { getUsername } = require('./utils');
const { opus } = require('prism-media');
const { AUDIO_PROCESSOR_URL, MIN_AUDIO_LENGTH } = require('./config');

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

  // Handle voice activity
  handleVoiceActivity(voiceChannel, receiver, async (audioBuffer, userId) => {
    if (isProcessingVoiceRequest) {
      console.log("Already processing a voice request");
      return null;
    }

    // Check if the audio buffer is long enough
    if (audioBuffer.length < MIN_AUDIO_LENGTH) {
      console.log("Audio buffer is too short");
      return null;
    }

    isProcessingVoiceRequest = true;

    // Format messages
    const messages = [];
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

      // Generate bot response
      const textRespose = await generateResponseFromMessages(messages, botConfig);
      console.log("Bot response:", textRespose);

      if (!textRespose || textRespose.length <= 0) {
        console.error("Error generating bot response");
        return null;
      }

      // Convert text to speech
      const responseAudioStream = await convertTextToSpeech(textRespose, botConfig);

      if (!responseAudioStream) {
        console.error("Error converting text to speech");
        return null;
      }

      // Play audio stream
      const player = playAudioStream(connection, responseAudioStream);

      // Wait for the audio stream to finish playing
      await player.on(AudioPlayerStatus.Idle);
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

async function convertTextToSpeech(text, botConfig) {
  try {
    const response = await axios.post(AUDIO_PROCESSOR_URL + '/text-to-speech/', {
      text,
      eleven_voice_id: botConfig.eleven_voice_id
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    });

    if (response.status === 200) {
      // Create a Buffer from the response data
      const audioBuffer = Buffer.from(response.data);
      
      // Create a Readable stream from the audio buffer
      const audioStream = new Readable({
        read() {
          this.push(audioBuffer);
          this.push(null);
        }
      });

      return audioStream;
    } else {
      console.error('Error from text-to-speech API:', response.statusText);
      return null;
    }
  } catch (error) {
    if (error.response) {
      console.error('Error in convertTextToSpeech:', error.response.status, error.response.data);
    } else {
      console.error('Error in convertTextToSpeech:', error.message);
    }
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
  receiver.speaking.on('start', (userId) => {
    const rawStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000 // Adjust this value (in ms) to fine-tune silence detection
      }
    });

    // Decode the audio stream using discordjs OpusEncoder
    const decoder = new opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
    const audioStream = rawStream.pipe(decoder);

    let audioBuffer = [];

    audioStream.on('data', (chunk) => {
      audioBuffer.push(chunk);
    });

    audioStream.on('end', async () => {
      //console.log(`User ${userId} stopped speaking`);
      if (audioBuffer.length > 0) {
        try {
          // Calculate the response probability (0.8 * 1 / peopleCount^2)
          const peopleCount = voiceChannel.members.size - 1;
          const responseProbability = 0.8 / Math.pow(peopleCount, 2);

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
  });
}

function leaveVC(guild) {
  const connection = getVoiceConnection(guild.id);
  if (connection) {
    connection.destroy();
    console.log("Bot has left the voice channel.");
  }
}

module.exports = { joinVC, leaveVC };