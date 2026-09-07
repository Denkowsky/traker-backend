require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('API Trakera z Detektywem i Pogodą działa!'));

app.get('/api/pollen', async (req, res) => {
    const { lat, lng, city } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "Brak współrzędnych" });

    try {
        // POBIERANIE PYŁKÓW
        const meteoUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto`;
        const meteoRes = await axios.get(meteoUrl);
        const currentData = meteoRes.data.current || {};

        // BEZPIECZNE POBIERANIE POGODY (jeśli API pogody padnie, serwer i tak wyśle pyłki)
        let weatherData = {};
        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,rain,showers,wind_speed_10m&timezone=auto`;
            const weatherRes = await axios.get(weatherUrl);
            weatherData = weatherRes.data.current || {};
        } catch (e) {
            console.error("Nie udało się pobrać pogody, ignoruję ten krok.");
        }

        const rainTotal = (weatherData.rain || 0) + (weatherData.showers || 0);
        const windSpeed = weatherData.wind_speed_10m || 0;
        const temp = weatherData.temperature_2m || 0;

        let weatherModifier = 0;
        let weatherMessage = "Warunki pogodowe są neutralne dla alergików.";
        let isRaining = false;

        if (rainTotal > 0.5) {
            weatherModifier = -2; 
            weatherMessage = "Pada deszcz! Woda zmywa pyłki z powietrza. Możesz bezpiecznie oddychać 🌧️.";
            isRaining = true;
        } else if (windSpeed > 20) {
            weatherModifier = 1;
            weatherMessage = "Uwaga na silny wiatr! Pyłki są agresywnie roznoszone po okolicy 🌬️.";
        }

        const obliczPoziom = (wartosc) => {
            if (!wartosc || wartosc === 0) return { level: 'Brak', index: 0 };
            
            let idx = 0;
            if (wartosc < 10) idx = 1;
            else if (wartosc < 50) idx = 2;
            else if (wartosc < 100) idx = 3;
            else idx = 4;

            let finalIdx = idx;
            if (idx > 0) {
                finalIdx = idx + weatherModifier;
                if (finalIdx < 1) finalIdx = 1; 
                if (finalIdx > 4) finalIdx = 4; 
            }

            const labels = ['Brak', 'Niski', 'Średni', 'Wysoki', 'Bardzo wysoki'];
            return { level: labels[finalIdx], index: finalIdx };
        };

        const responseData = {
            location: city || "Lokalizacja z GPS",
            weather: { temp, windSpeed, isRaining, message: weatherMessage },
            allergens: [
                { id: 'birch', name: 'Brzoza', type: 'Drzewo', ...obliczPoziom(currentData.birch_pollen) },
                { id: 'grass', name: 'Trawy', type: 'Trawa', ...obliczPoziom(currentData.grass_pollen) },
                { id: 'mugwort', name: 'Bylica', type: 'Chwast', ...obliczPoziom(currentData.mugwort_pollen) },
                { id: 'alder', name: 'Olcha', type: 'Drzewo', ...obliczPoziom(currentData.alder_pollen) },
                { id: 'ragweed', name: 'Ambrozja', type: 'Chwast', ...obliczPoziom(currentData.ragweed_pollen) },
                { id: 'olive', name: 'Oliwka', type: 'Drzewo', ...obliczPoziom(currentData.olive_pollen) }
            ],
            generalAdvice: "Dane z satelity Copernicus + Pogoda na żywo."
        };
        res.status(200).json(responseData);
    } catch (error) {
        console.error("Błąd główny API:", error.message);
        res.status(500).json({ error: "Błąd API Open-Meteo" });
    }
});

app.listen(PORT, () => console.log(`🚀 Serwer działa na porcie ${PORT}!`));