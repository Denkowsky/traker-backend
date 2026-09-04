require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('API Trakera Pylenia PL działa!'));

app.get('/api/pollen', async (req, res) => {
    const { lat, lng, city } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "Brak współrzędnych" });

    try {
        // DODANE: olive_pollen (Oliwka) oraz ragweed_pollen (Ambrozja)
        const openMeteoUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;
        const meteoRes = await axios.get(openMeteoUrl);
        const currentData = meteoRes.data.current;

        const obliczPoziom = (wartosc) => {
            if (!wartosc || wartosc === 0) return { level: 'Brak', index: 0 };
            if (wartosc < 10) return { level: 'Niski', index: 1 };
            if (wartosc < 50) return { level: 'Średni', index: 2 };
            if (wartosc < 100) return { level: 'Wysoki', index: 3 };
            return { level: 'Bardzo wysoki', index: 4 };
        };

        const responseData = {
            location: city || "Lokalizacja z GPS",
            allergens: [
                { id: 'birch', name: 'Brzoza', type: 'Drzewo', ...obliczPoziom(currentData.birch_pollen) },
                { id: 'grass', name: 'Trawy', type: 'Trawa', ...obliczPoziom(currentData.grass_pollen) },
                { id: 'mugwort', name: 'Bylica', type: 'Chwast', ...obliczPoziom(currentData.mugwort_pollen) },
                { id: 'alder', name: 'Olcha', type: 'Drzewo', ...obliczPoziom(currentData.alder_pollen) },
                { id: 'ragweed', name: 'Ambrozja', type: 'Chwast', ...obliczPoziom(currentData.ragweed_pollen) },
                { id: 'olive', name: 'Oliwka', type: 'Drzewo', ...obliczPoziom(currentData.olive_pollen) }
            ],
            generalAdvice: "Dane satelitarne (Copernicus) na żywo."
        };
        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ error: "Błąd API Open-Meteo" });
    }
});

app.listen(PORT, () => console.log(`🚀 Serwer działa!`));