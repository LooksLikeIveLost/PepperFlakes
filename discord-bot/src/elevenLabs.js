const axios = require('axios');
const { Readable } = require('stream');
const { AUDIO_PROCESSOR_URL } = require('./config');

const tempVoiceStorage = {};

function addToVoiceTempStorage(voiceId, data) {
  tempVoiceStorage[voiceId] = {
    ...data,
    timestamp: Date.now()
  };
}

function getFromVoiceTempStorage(voiceId) {
  return tempVoiceStorage[voiceId] || null;
}

function deleteFromVoiceTempStorage(voiceId) {
  delete tempVoiceStorage[voiceId];
}

function cleanupTempStorage() {
  const now = Date.now();
  const expirationTime = 30 * 60 * 1000; // 30 minutes

  Object.keys(tempVoiceStorage).forEach(userId => {
    if (now - tempVoiceStorage[userId].timestamp > expirationTime) {
      delete tempVoiceStorage[userId];
    }
  });
}

setInterval(cleanupTempStorage, 15 * 60 * 1000);

async function convertTextToSpeech(text, botConfig) {
  try {
    const response = await axios.post(AUDIO_PROCESSOR_URL + '/text-to-speech/', {
      text: text,
      eleven_voice_id: botConfig.eleven_voice_id
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    });

    if (response.status === 200) {
      // Create a Buffer from the response data
      const audioBuffer = Buffer.from(response.data, 'base64');
      
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
      console.error('Error in convertTextToSpeech:', error.response.data);
    }
    return null;
  }
}

async function generateVoicePreviews(description, text) {
  try {
    const response = await axios.post(AUDIO_PROCESSOR_URL + '/generate-voice-previews/', {
      voice_description: description,
      text: text
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.status === 200) {
      // console.log('Preview response:', JSON.stringify(response.data, null, 2));
      return response.data.previews;
    } else {
      console.error('Error from generate-voice-previews API:', response.statusText);
      return null;
    }
  } catch (error) {
    console.error('Error in generateVoicePreviews:', error.response.data);
    return null;
  }
}

async function createVoiceFromPreview(name, description, generatedVoiceId) {
  try {
    const response = await axios.post(AUDIO_PROCESSOR_URL + '/create-voice-from-preview/', {
      voice_name: name,
      voice_description: description,
      generated_voice_id: generatedVoiceId
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.status === 200) {
      return response.data.voice_id;
    } else {
      console.error('Error from create-voice-from-preview API:', response.statusText);
      return null;
    }
  } catch (error) {
    console.error('Error in createVoiceFromPreview:', error.response.data);
    return null;
  }
}

async function cloneVoice(name, audioFile) {
  try {
    const formData = new FormData();
    formData.append('voice_name', name);
    formData.append('voice_file', new Blob([audioFile], { type: 'audio/mpeg' }), 'voice.mp3');

    const response = await axios.post(AUDIO_PROCESSOR_URL + '/clone-voice/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      }
    });

    if (response.status === 200) {
      return response.data.voice_id;
    } else {
      console.error('Error from clone-voice API:', response.statusText);
      return null;
    }
  } catch (error) {
    console.error('Error in cloneVoice:', error.response ? error.response.data : error.message);
    return null;
  }
}

async function deleteVoice(voiceId) {
  try {
    const response = await axios.post(AUDIO_PROCESSOR_URL + `/delete-voice/${voiceId}`);

    if (response.status === 200) {
      return true;
    } else {
      console.error('Error from delete-voice API:', response.statusText);
      return false;
    }
  } catch (error) {
    console.error('Error in deleteVoice:', error.response.data);
    return false;
  }
}

module.exports = {
  convertTextToSpeech,
  generateVoicePreviews,
  createVoiceFromPreview,
  cloneVoice,
  deleteVoice,
  addToVoiceTempStorage,
  getFromVoiceTempStorage,
  deleteFromVoiceTempStorage
};