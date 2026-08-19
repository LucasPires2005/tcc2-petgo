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

// A porta agora é dinâmica para o Render conseguir subir o serviço
const PORT = process.env.PORT || 3000;

// O servidor escuta as requisições na porta correta
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor Rodando na porta: ${PORT}`);
});

// Teste de migração para o novo repositório pessoal - PetGo