const express = require('express');

const app = express();
const PORT = 3000;

// Permitir recibir datos JSON
app.use(express.json());

// Ruta para comprobar que el servidor funciona
app.get('/health', (req, res) => {
    res.status(200).json({
        mensaje: 'Backend del Grupo 7 funcionando',
        estado: 'OK'
    });
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
