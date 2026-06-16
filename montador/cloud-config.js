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
export const CLOUD_ATIVO = false;

export const firebaseConfig = {
  // apiKey: '...',
  // authDomain: '...',
  // projectId: '...',
  // appId: '...',
};
