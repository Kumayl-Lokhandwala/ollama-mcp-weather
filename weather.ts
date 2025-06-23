#!/usr/bin/env node
import fetch from "node-fetch";

// Configuration
const OLLAMA_MODEL = "llama3.2:latest";
const OLLAMA_HOST = "http://localhost:11434";
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

class AutonomousWeatherAgent {
  private readonly systemPrompt = `You are an advanced weather assistant with API access. Follow these rules:

1. AUTONOMOUS DECISION MAKING:
   - When you detect a weather-related question, YOU MUST call the weather API
   - Determine the exact location needed from the query
   - For non-weather questions, respond normally

2. API USAGE PROTOCOL:
   - Call format: [WEATHER_API_CALL]{location}[/WEATHER_API_CALL]
   - You will receive raw JSON weather data
   - Interpret and present this data professionally

3. RESPONSE GUIDELINES:
   - Always provide accurate, sourced weather information
   - Include relevant details (temp, conditions, etc.)
   - Add practical recommendations when appropriate
   - Use clear, conversational language`;

  public async handleQuery(userQuery: string): Promise<string> {
    try {
      // Phase 1: Let LLM analyze the query
      const analysis = await this.analyzeQuery(userQuery);

      // Phase 2: Handle weather API call if needed
      if (analysis.needsWeatherData) {
        const weatherData = await this.fetchWeatherData(analysis.location);
        return this.generateWeatherResponse(userQuery, weatherData);
      }

      // Phase 3: Normal response for non-weather queries
      return this.generateGeneralResponse(userQuery);
    } catch (error) {
      console.error("Error:", error);
      return "I encountered an issue processing your request. Please try again.";
    }
  }

  private async analyzeQuery(
    query: string
  ): Promise<{ needsWeatherData: boolean; location: string }> {
    const analysisPrompt = `Analyze this user query to determine if weather data is needed:

        Query: "${query}"

        Respond STRICTLY in this JSON format:
        {
            "needsWeatherData": boolean,
            "location": "extracted location or empty string"
        }`;

    const response = await this.callLLM(analysisPrompt);

    try {
      return JSON.parse(response.trim());
    } catch {
      return { needsWeatherData: false, location: "" };
    }
  }

  private async fetchWeatherData(location: string): Promise<any> {
    if (!OPENWEATHER_API_KEY) throw new Error("API key not configured");

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        location
      )}&units=metric&appid=${OPENWEATHER_API_KEY}`
    );

    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }

  private async generateWeatherResponse(
    query: string,
    weatherData: any
  ): Promise<string> {
    const context = `Weather data for ${weatherData.name}:
        - Temperature: ${weatherData.main.temp}°C
        - Feels like: ${weatherData.main.feels_like}°C
        - Conditions: ${weatherData.weather[0].description}
        - Humidity: ${weatherData.main.humidity}%
        - Wind: ${weatherData.wind.speed} km/h
        - Pressure: ${weatherData.main.pressure} hPa`;

    const responsePrompt = `User asked: "${query}"
        
        Using this weather data:
        ${context}

        Generate a detailed, helpful response answering the user's question specifically. 
        Include relevant numbers and practical advice when appropriate.`;

    return this.callLLM(responsePrompt);
  }

  private async generateGeneralResponse(query: string): Promise<string> {
    return this.callLLM(
      `User asked: "${query}"\n\nProvide a helpful response.`
    );
  }

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `${this.systemPrompt}\n\n${prompt}`,
        stream: false,
        options: {
          temperature: 0.3,
          num_ctx: 8192,
        },
      }),
    });

    if (!response.ok) throw new Error("LLM request failed");
    const data = (await response.json()) as { response: string };
    return data.response;
  }
}

// Execution
(async () => {
  if (!process.argv[2]) {
    console.log('Usage: weather-agent.ts "your question"');
    process.exit(1);
  }

  const query = process.argv.slice(2).join(" ");
  const agent = new AutonomousWeatherAgent();

  console.log("\n🌤️ Processing your query...");
  const response = await agent.handleQuery(query);

  console.log("\n💡 Response:");
  console.log(response);
  console.log("");
})().catch(console.error);
