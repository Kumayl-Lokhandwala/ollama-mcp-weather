#!/usr/bin/env node
import fetch from 'node-fetch';

// 1. Configure with your exact model name from `ollama list`
const OLLAMA_MODEL = "llama3.2:latest"; // ← Must match exactly what you see in `ollama list`

async function getWeatherData(location: string) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) throw new Error('Missing OPENWEATHER_API_KEY');

    const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${location}&units=metric&appid=${apiKey}`
    );
    
    if (!response.ok) {
        throw new Error(`Weather API failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.debug("🌐 Raw API Data:", JSON.stringify(data, null, 2)); // Debug log
    return data;
}

async function enhanceWithLLM(weather: any) {
    const prompt = `Create a detailed weather report for ${weather.name} with:
    - Conditions: ${weather.weather[0].description}
    - Temperature: ${weather.main.temp}°C
    - Humidity: ${weather.main.humidity}%
    - Wind: ${weather.wind?.speed || 'N/A'} km/h
    Format with emojis and practical advice.`;

    const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL, // Using your specific model
            prompt: prompt,
            stream: false
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama API failed: ${response.statusText}`);
    }

    const result = await response.json() as { response?: string };
    
    if (!result.response) {
        throw new Error("Ollama returned empty response");
    }
    
    return result.response;
}

async function main() {
    try {
        const location = process.argv[2];
        if (!location) throw new Error("Usage: weather <city>");

        console.log("🌤️  Fetching weather for", location);
        const weather = await getWeatherData(location);
        
        console.log("✨ Enhancing with", OLLAMA_MODEL);
        const report = await enhanceWithLLM(weather);
        
        console.log("\n=== WEATHER REPORT ===");
        console.log(report);
        console.log("=====================\n");
        
    } catch (error) {
        console.error("\n❌ Error:", error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();