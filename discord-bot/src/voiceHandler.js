const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource
} = require('@discordjs/voice');
const { getUsername } = require('./bot');

// Function to join voice channel
async function joinVC(voiceChannel) {
  if (!voiceChannel) return;

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
  handleVoiceActivity(voiceChannel, receiver, processAudio);
}

async function processAudio(audioBuffer, userId) {
  // Check if the audio buffer is long enough
  if (audioBuffer.length < MIN_AUDIO_LENGTH) return null;

  // Format messages
  const messages = [];
  const username = await getUsername(userId);

  const responseAudioStream = await requestAudioResponse(username, messages, audioBuffer);

  // Play audio stream
  const player = playAudioStream(connection, responseAudioStream);
  
  // Catch errors
  player.on('error', error => {
    console.error('Error playing audio:', error);
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log('Audio playback finished');
    isProcessingVoiceRequest = false;
  });
}

function playFile(connection, filePath) {
  const player = createAudioPlayer();
  const resource = createAudioResource(filePath);
  player.play(resource);
  connection.subscribe(player);
  return player;
}

function playAudioStream(connection, audioStream) {
  const player = createAudioPlayer();
  player.play(audioStream);
  connection.subscribe(player);
  return player;
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
            console.log("Probability check passed, probability:", responseProbability, "Random value:", randomValue);
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

function leaveVC(message) {
  const connection = getVoiceConnection(message.guild.id);
  if (connection) {
    connection.destroy();
    console.log("Bot has left the voice channel.");
  }
}

module.exports = { joinVC, leaveVC };