const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Torna a pasta 'uploads' acessível publicamente
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const animalRoutes = require('./routes/animals');
const authRoutes = require('./routes/auth');

app.use('/animals', animalRoutes);
app.use('/auth', authRoutes);

app.get('/', (req, res) => res.send('API PetGo 2.0 Rodando 🚀'));

const PORT = 3000;

// O servidor continua ouvindo em '0.0.0.0' para aceitar o túnel do ngrok
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor Local: http://localhost:${PORT}`);
  console.log(`🌍 Túnel Público: https://subpeltate-gene-nonpracticed.ngrok-free.dev`);
});