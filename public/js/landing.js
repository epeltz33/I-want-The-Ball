import { ROOM_CODE_PATTERN } from './constants.js';

// No look-alike characters (0/o, 1/l/i) so codes are easy to read aloud or type on a phone.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function goToRoom(code) {
  location.assign(`/r/${code}`);
}

document.getElementById('create').addEventListener('click', () => goToRoom(randomCode()));

const form = document.getElementById('join');
const input = document.getElementById('code');
const error = document.getElementById('join-error');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = input.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!ROOM_CODE_PATTERN.test(code)) {
    error.textContent = 'Room codes are 4–12 letters or numbers.';
    error.hidden = false;
    return;
  }
  goToRoom(code);
});

input.addEventListener('input', () => {
  error.hidden = true;
});
