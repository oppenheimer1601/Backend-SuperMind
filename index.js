const express = require('express');
const bodyParser = require('body-parser');
const EventSource = require('eventsource'); // For handling streaming
//add dot env
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());

// Langflow Client Class
class LangflowClient {
    constructor(baseURL, applicationToken) {
        this.baseURL = baseURL;
        this.applicationToken = applicationToken;
    }

    async post(endpoint, body, headers = { "Content-Type": "application/json" }) {
        headers["Authorization"] = `Bearer ${this.applicationToken}`;
        const url = `${this.baseURL}${endpoint}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            const responseMessage = await response.json();
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText} - ${JSON.stringify(responseMessage)}`);
            }
            return responseMessage;
        } catch (error) {
            console.error('Request Error:', error.message);
            throw error;
        }
    }

    async initiateSession(flowId, langflowId, inputValue, inputType = 'chat', outputType = 'chat', stream = false, tweaks = {}) {
        const endpoint = `/lf/${langflowId}/api/v1/run/${flowId}?stream=${stream}`;
        return this.post(endpoint, { input_value: inputValue, input_type: inputType, output_type: outputType, tweaks: tweaks });
    }

    handleStream(streamUrl, onUpdate, onClose, onError) {
        const eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            onUpdate(data);
        };

        eventSource.onerror = (event) => {
            console.error('Stream Error:', event);
            onError(event);
            eventSource.close();
        };

        eventSource.addEventListener("close", () => {
            onClose('Stream closed');
            eventSource.close();
        });

        return eventSource;
    }

    async runFlow(flowIdOrName, langflowId, inputValue, inputType = 'chat', outputType = 'chat', tweaks = {}, stream = false, onUpdate, onClose, onError) {
        try {
            const initResponse = await this.initiateSession(flowIdOrName, langflowId, inputValue, inputType, outputType, stream, tweaks);
            console.log('Init Response:', initResponse);
            if (stream && initResponse && initResponse.outputs && initResponse.outputs[0].outputs[0].artifacts.stream_url) {
                const streamUrl = initResponse.outputs[0].outputs[0].artifacts.stream_url;
                console.log(`Streaming from: ${streamUrl}`);
                this.handleStream(streamUrl, onUpdate, onClose, onError);
            }
            return initResponse;
        } catch (error) {
            console.error('Error running flow:', error);
            throw new Error('Error initiating session');
        }
    }
}

// Environment variables (replace with actual values or use dotenv)
const BASE_URL = process.env.BASE_URL;
const APPLICATION_TOKEN = process.env.APPLICATION_TOKEN;
const FLOW_ID = process.env.FLOW_ID;
const LANGFLOW_ID = process.env.LANGFLOW_ID;

// Instantiate Langflow Client
const langflowClient = new LangflowClient(BASE_URL, APPLICATION_TOKEN);

// API Routes
app.post('/run-flow', async (req, res) => {
    const { inputValue, inputType = 'chat', outputType = 'chat', stream = false } = req.body;
    console.log(inputValue, inputType, outputType, stream);

    try {
        const tweaks = {
            "ChatInput-Zvqp4": {},
            "ParseData-bmuuF": {},
            "Prompt-nPeug": {},
            "SplitText-QgyJr": {},
            "OpenAIModel-H9u2C": {},
            "ChatOutput-HjX13": {},
            "AstraDB-kFYYv": {},
            "OpenAIEmbeddings-QvVOu": {},
            "AstraDB-LBn47": {},
            "OpenAIEmbeddings-2gAbb": {},
            "File-7y9jj": {}
        };

        const response = await langflowClient.runFlow(
            FLOW_ID,
            LANGFLOW_ID,
            inputValue,
            inputType,
            outputType,
            tweaks,
            stream,
            (data) => console.log("Streaming Update:", data.chunk), // onUpdate
            (message) => console.log("Stream Closed:", message), // onClose
            (error) => console.error("Stream Error:", error) // onError
        );

        if (!stream && response && response.outputs) {
            const flowOutputs = response.outputs[0];
            const firstComponentOutputs = flowOutputs.outputs[0];
            const output = firstComponentOutputs.outputs.message;

            res.json({ success: true, output: output.message.text });
        } else {
            res.json({ success: true, message: 'Stream in progress' });
        }
    } catch (error) {
        console.error('Error in /run-flow:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Langflow Express server is running on http://localhost:${PORT}`);
});