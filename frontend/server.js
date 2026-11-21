const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir mockups si existe la carpeta localmente en el proyecto
const mockupsPath = path.join(__dirname, 'mockups');
if (fs.existsSync(mockupsPath)) {
  app.use('/mockups', express.static(mockupsPath));
}

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback a index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 AURA Compras Web Server activo en: http://localhost:${PORT}`);
  console.log(`🎨 Basado en los Mockups y Diseño Oficial de Figma`);
  console.log(`====================================================`);
});
