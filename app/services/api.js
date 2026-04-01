const BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';

export async function getAnimals() {
  try {
    const res = await fetch(`${BASE_URL}/animals`, {
      headers: { 
        'ngrok-skip-browser-warning': 'true', // Pula o aviso do ngrok
        'Accept': 'application/json'
      }
    });
    
    const data = await res.json();
    console.log("📡 API chamando animais:", data.length, "encontrados"); // Log para você ver no terminal
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.log("❌ Erro na API getAnimals:", error);
    return [];
  }
}