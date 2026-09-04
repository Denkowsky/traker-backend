require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // <-- Dodajemy bibliotekę do strzałów HTTP

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('API Trakera Pylenia PL działa!');
});

// ZAKTUALIZOWANY ENDPOINT
app.get('/api/pollen', async (req, res) => {
    const { lat, lng, city } = req.query;

    // Zabezpieczenie: jeśli z jakiegoś powodu Flutter nie przyśle współrzędnych
    if (!lat || !lng) {
        return res.status(400).json({ error: "Brak współrzędnych GPS (lat, lng)" });
    }

    try {
        // 1. Odpytujemy prawdziwe API Open-Meteo dla przekazanych koordynatów
        const openMeteoUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen`;
        
        const meteoRes = await axios.get(openMeteoUrl);
        const currentData = meteoRes.data.current;

        // 2. Funkcja pomocnicza: zamienia ilość ziaren/m³ na nasz poziom (0-4) dla Fluttera
        const obliczPoziom = (wartosc) => {
            if (!wartosc || wartosc === 0) return { level: 'Brak', index: 0 };
            if (wartosc < 10) return { level: 'Niski', index: 1 };
            if (wartosc < 50) return { level: 'Średni', index: 2 };
            if (wartosc < 100) return { level: 'Wysoki', index: 3 };
            return { level: 'Bardzo wysoki', index: 4 };
        };

        // 3. Przeliczamy dane z satelity
        const brzoza = obliczPoziom(currentData.birch_pollen);
        const trawy = obliczPoziom(currentData.grass_pollen);
        const bylica = obliczPoziom(currentData.mugwort_pollen);
        const olcha = obliczPoziom(currentData.alder_pollen);

        // 4. Pakujemy to w nasz własny, gotowy JSON
        const responseData = {
            location: city || "Lokalizacja z GPS",
            coordinates: { lat, lng },
            date: currentData.time,
            allergens: [
                { id: 'birch', name: 'Brzoza', type: 'Drzewo', level: brzoza.level, index: brzoza.index },
                { id: 'grass', name: 'Trawy', type: 'Trawa', level: trawy.level, index: trawy.index },
                { id: 'mugwort', name: 'Bylica', type: 'Chwast', level: bylica.level, index: bylica.index },
                { id: 'alder', name: 'Olcha', type: 'Drzewo', level: olcha.level, index: olcha.index }
            ],
            generalAdvice: "Dane pobrane z satelity Copernicus (Open-Meteo) dla Twojej dokładnej lokalizacji!"
        };

        // 5. Odsyłamy do aplikacji
        res.status(200).json(responseData);

    } catch (error) {
        console.error("Błąd API Open-Meteo:", error.message);
        res.status(500).json({ error: "Błąd podczas pobierania danych z satelity" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na porcie http://localhost:${PORT}`);
});