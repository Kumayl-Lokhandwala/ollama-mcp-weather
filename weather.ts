#!/usr/bin/env node
import fetch from 'node-fetch';

// Configuration
const OLLAMA_MODEL = "llama3.2:latest";
const OLLAMA_HOST = "http://localhost:11434";
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// System Context Configuration
const SYSTEM_DIRECTIVES = {
    identity: "Autonomous Weather Agent",
    capabilities: [
        "Determine when weather information is needed",
        "Automatically fetch weather data when appropriate",
        "Generate context-aware responses"
    ],
    rules: {
        weather_triggers: [
            "weather in", "temperature in", "forecast for",
            "humidity in", "how's the weather", "climate in"
        ],
        auto_fetch: true,
        confirmation_threshold: 0.8
    }
};

async function queryModel(prompt: string, context?: string) {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            prompt: context ? `${context}\n\n${prompt}` : prompt,
            stream: false,
            options: {
                temperature: 0.3,
                num_ctx: 8192
            }
        })
    });

    if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);
    const data = await response.json() as { response: string };
    return data.response;
}

type WeatherData = {
    main: {
        temp: number;
        feels_like: number;
        humidity: number;
        pressure: number;
    };
    weather: { description: string }[];
    wind: { speed: number };
};

async function getWeatherData(location: string): Promise<WeatherData> {
    if (!WEATHER_API_KEY) throw new Error('Weather API key not configured');
    
    const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${location}&units=metric&appid=${WEATHER_API_KEY}`
    );
    
    if (!response.ok) throw new Error(`Weather API failed: ${response.statusText}`);
    return await response.json() as WeatherData;
}

async function shouldFetchWeather(query: string): Promise<{fetch: boolean, location?: string}> {
    const analysisPrompt = `Analyze this query and determine if weather data is needed:
    
    Query: "${query}"
    
    Respond ONLY with JSON in this format:
    {
        "fetch": boolean,
        "location": "extracted location or null",
        "confidence": 0-1
    }`;

    const response = await queryModel(analysisPrompt, JSON.stringify(SYSTEM_DIRECTIVES));
    
    try {
        const result = JSON.parse(response.trim());
        return {
            fetch: result.fetch && result.confidence >= SYSTEM_DIRECTIVES.rules.confirmation_threshold,
            location: result.location
        };
    } catch {
        return { fetch: false };
    }
}

async function generateWeatherResponse(location: string) {
    const weather = await getWeatherData(location);
    
    const weatherContext = `Current weather data for ${location}:
    - Temperature: ${weather.main.temp}°C (feels like ${weather.main.feels_like}°C)
    - Conditions: ${weather.weather[0].description}
    - Humidity: ${weather.main.humidity}%
    - Wind: ${weather.wind.speed} km/h
    - Pressure: ${weather.main.pressure} hPa`;
    
    return await queryModel(
        `Generate a friendly weather report using this data: ${weatherContext}`,
        "You are a weather assistant. Provide clear, concise reports with practical advice."
    );
}

async function handleQuery(query: string) {
    const { fetch, location } = await shouldFetchWeather(query);
    
    if (fetch && location) {
        try {
            const weatherReport = await generateWeatherResponse(location);
            console.log("\n🌦️ Weather Report:");
            console.log(weatherReport);
        } catch (error) {
            console.log("\n⚠️ Couldn't fetch weather data. Here's what I know:");
            console.log(await queryModel(query));
        }
    } else {
        console.log("\n🤖 General Response:");
        console.log(await queryModel(query));
    }
}

async function main() {
    const query = process.argv.slice(2).join(" ");
    if (!query) {
        console.log("Please provide a query");
        process.exit(1);
    }

    console.log(`🔍 Analyzing: "${query}"`);
    await handleQuery(query);
}

main().catch(console.error);