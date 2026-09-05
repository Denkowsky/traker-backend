require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('API Trakera z Wersją PRO (14 Dni) działa!'));

app.get('/api/pollen', async (req, res) => {
    const { lat, lng, city } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "Brak współrzędnych" });

    try {
        // 1. ZAPYTANIE O PYŁKI (Aktualne + Godzinowe na kilka dni do przodu)
        const meteoUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto`;
        const meteoRes = await axios.get(meteoUrl);
        const currentPollen = meteoRes.data.current || {};
        const hourlyPollen = meteoRes.data.hourly || {};

        // 2. ZAPYTANIE O POGODĘ (Aktualna + Dzienna aż na 14 dni!)
        let weatherData = {};
        let dailyWeather = {};
        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,rain,showers,wind_speed_10m&daily=temperature_2m_max,rain_sum,wind_speed_10m_max&forecast_days=14&timezone=auto`;
            const weatherRes = await axios.get(weatherUrl);
            weatherData = weatherRes.data.current || {};
            dailyWeather = weatherRes.data.daily || {};
        } catch (e) {
            console.error("Nie udało się pobrać pogody na 14 dni.");
        }

        // Pomocnicza funkcja wyliczająca indeks zagrożenia z wzięciem pod uwagę wiatru i deszczu
        const obliczPoziom = (wartosc, rain, wind) => {
            if (!wartosc || wartosc === 0) return { level: 'Brak', index: 0 };
            
            let idx = 0;
            if (wartosc < 10) idx = 1;
            else if (wartosc < 50) idx = 2;
            else if (wartosc < 100) idx = 3;
            else idx = 4;

            // Korekta pogodowa (deszcz zmywa pyłki, wiatr pogarsza sprawę)
            let modifier = 0;
            if (rain > 0.5) modifier = -2;
            else if (wind > 20) modifier = 1;

            let finalIdx = idx + modifier;
            if (finalIdx < 1 && idx > 0) finalIdx = 1; 
            if (finalIdx > 4) finalIdx = 4; 

            const labels = ['Brak', 'Niskie', 'Średnie', 'Wysokie', 'Ekstremalne'];
            return { level: labels[finalIdx], index: finalIdx };
        };

        // ANALIZA BIEŻĄCEJ POGODY (Dla darmowych i PRO)
        const currentRain = (weatherData.rain || 0) + (weatherData.showers || 0);
        const currentWind = weatherData.wind_speed_10m || 0;
        const currentTemp = weatherData.temperature_2m || 0;
        
        let weatherMessage = "Warunki pogodowe są neutralne dla alergików.";
        if (currentRain > 0.5) weatherMessage = "Pada deszcz! Woda zmywa pyłki z powietrza. Możesz bezpiecznie oddychać 🌧️.";
        else if (currentWind > 20) weatherMessage = "Uwaga na silny wiatr! Pyłki są agresywnie roznoszone po okolicy 🌬️.";

        // --- MAGIA: GENEROWANIE PROGNOZY NA 14 DNI (Tylko dla wersji PRO) ---
        const forecastList = [];
        if (dailyWeather.time && hourlyPollen.time) {
            for (let i = 0; i < dailyWeather.time.length; i++) {
                const dateStr = dailyWeather.time[i]; 
                const dRain = dailyWeather.rain_sum ? dailyWeather.rain_sum[i] : 0;
                const dWind = dailyWeather.wind_speed_10m_max ? dailyWeather.wind_speed_10m_max[i] : 0;
                const dTemp = dailyWeather.temperature_2m_max ? dailyWeather.temperature_2m_max[i] : 0;

                // Szukamy najwyższego stężenia godzinowego dla każdego pyłku w danym dniu
                let maxBirch=0, maxGrass=0, maxMugwort=0, maxAlder=0, maxRagweed=0, maxOlive=0;
                
                for (let j = 0; j < hourlyPollen.time.length; j++) {
                    if (hourlyPollen.time[j].startsWith(dateStr)) {
                        if (hourlyPollen.birch_pollen[j] > maxBirch) maxBirch = hourlyPollen.birch_pollen[j];
                        if (hourlyPollen.grass_pollen[j] > maxGrass) maxGrass = hourlyPollen.grass_pollen[j];
                        if (hourlyPollen.mugwort_pollen[j] > maxMugwort) maxMugwort = hourlyPollen.mugwort_pollen[j];
                        if (hourlyPollen.alder_pollen[j] > maxAlder) maxAlder = hourlyPollen.alder_pollen[j];
                        if (hourlyPollen.ragweed_pollen[j] > maxRagweed) maxRagweed = hourlyPollen.ragweed_pollen[j];
                        if (hourlyPollen.olive_pollen[j] > maxOlive) maxOlive = hourlyPollen.olive_pollen[j];
                    }
                }

                // AI PREDICT: Jeśli darmowe satelity dają dane tylko na 5 dni do przodu, 
                // symulujemy trend na podstawie ostatniego znanego dnia i deszczu (wygładzanie)
                if (maxBirch === 0 && maxGrass === 0 && i > 0 && forecastList.length > 0) {
                     let prev = forecastList[i-1]._raw;
                     let rainFactor = dRain > 1 ? 0.3 : 1.0; // Deszcz zmywa pyłki o 70%
                     maxBirch = prev.maxBirch * rainFactor;
                     maxGrass = prev.maxGrass * rainFactor;
                     maxMugwort = prev.maxMugwort * rainFactor;
                     maxAlder = prev.maxAlder * rainFactor;
                     maxRagweed = prev.maxRagweed * rainFactor;
                     maxOlive = prev.maxOlive * rainFactor;
                }

                forecastList.push({
                    date: dateStr,
                    weather: { temp: dTemp, rain: dRain, wind: dWind },
                    _raw: { maxBirch, maxGrass, maxMugwort, maxAlder, maxRagweed, maxOlive }, 
                    allergens: [
                        { name: 'Brzoza', ...obliczPoziom(maxBirch, dRain, dWind) },
                        { name: 'Trawy', ...obliczPoziom(maxGrass, dRain, dWind) },
                        { name: 'Bylica', ...obliczPoziom(maxMugwort, dRain, dWind) },
                        { name: 'Olcha', ...obliczPoziom(maxAlder, dRain, dWind) },
                        { name: 'Ambrozja', ...obliczPoziom(maxRagweed, dRain, dWind) },
                        { name: 'Oliwka', ...obliczPoziom(maxOlive, dRain, dWind) }
                    ]
                });
            }
        }

        // Zbudowanie pełnej odpowiedzi
        const responseData = {
            location: city || "Lokalizacja z GPS",
            weather: { temp: currentTemp, windSpeed: currentWind, isRaining: currentRain > 0.5, message: weatherMessage },
            allergens: [
                { id: 'birch', name: 'Brzoza', type: 'Drzewo', ...obliczPoziom(currentPollen.birch_pollen, currentRain, currentWind) },
                { id: 'grass', name: 'Trawy', type: 'Trawa', ...obliczPoziom(currentPollen.grass_pollen, currentRain, currentWind) },
                { id: 'mugwort', name: 'Bylica', type: 'Chwast', ...obliczPoziom(currentPollen.mugwort_pollen, currentRain, currentWind) },
                { id: 'alder', name: 'Olcha', type: 'Drzewo', ...obliczPoziom(currentPollen.alder_pollen, currentRain, currentWind) },
                { id: 'ragweed', name: 'Ambrozja', type: 'Chwast', ...obliczPoziom(currentPollen.ragweed_pollen, currentRain, currentWind) },
                { id: 'olive', name: 'Oliwka', type: 'Drzewo', ...obliczPoziom(currentPollen.olive_pollen, currentRain, currentWind) }
            ],
            forecast: forecastList, // TA TABLICA ODBLOKOWUJE WERSJĘ PRO!
            generalAdvice: "Dane z satelity Copernicus + Pogoda na żywo."
        };
        
        res.status(200).json(responseData);
    } catch (error) {
        console.error("Błąd główny API:", error.message);
        res.status(500).json({ error: "Błąd API Open-Meteo" });
    }
});

app.listen(PORT, () => console.log(`🚀 Serwer działa na porcie ${PORT}!`));