// @ts-check
/**
 * CONFIGURAÇÃO DA NUVEM (Firebase) — opcional.
 *
 * Enquanto CLOUD_ATIVO = false (ou config vazia), o montador funciona LOCAL
 * (localStorage), como hoje. Para ligar a sincronização entre aparelhos:
 *
 *   1. Crie um projeto em https://console.firebase.google.com (grátis).
 *   2. Ative "Authentication" → método "E-mail/senha" e crie seu usuário coach.
 *   3. Ative "Firestore Database" (modo produção).
 *   4. Em Firestore → Regras, cole:
 *        rules_version = '2';
 *        service cloud.firestore {
 *          match /databases/{db}/documents {
 *            match /coaches/{uid} {
 *              allow read, write: if request.auth != null && request.auth.uid == uid;
 *            }
 *          }
 *        }
 *   5. Configurações do projeto → "Seus apps" → app Web → copie o objeto
 *      firebaseConfig e cole abaixo. Depois mude CLOUD_ATIVO para true e commite.
 *
 * Obs.: apiKey do Firebase é pública por design — pode ficar no repositório.
 * A segurança vem do login e das regras acima.
 */
export const CLOUD_ATIVO = true;

export const firebaseConfig = {
  apiKey: 'AIzaSyCQ_uioP7PSfU_iDpUmIlMxBOxil5E7WJA',
  authDomain: 'projeto-garage-f0a2f.firebaseapp.com',
  projectId: 'projeto-garage-f0a2f',
  storageBucket: 'projeto-garage-f0a2f.firebasestorage.app',
  messagingSenderId: '1070032577952',
  appId: '1:1070032577952:web:886f7d472f01e6dd8c70c5',
  measurementId: 'G-K2M7BLNW8V',
};
