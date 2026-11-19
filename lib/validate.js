const NAME_PATTERN = /^[\p{L}]+(?:[ .'-][\p{L}]+)*$/u;
const PLACE_PATTERN = /^[\p{L}]+(?:[ .,'-][\p{L}]+)*$/u;
const PHONE_PATTERN = /^\+?[\d\s().-]{5,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function trimTo(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isPersonName(value) {
  const s = trimTo(value, 80);
  return s.length >= 1 && NAME_PATTERN.test(s);
}

function isPlaceName(value) {
  const s = trimTo(value, 120);
  return s.length === 0 || PLACE_PATTERN.test(s);
}

function isPhone(value) {
  const s = trimTo(value, 40);
  if (s.length === 0) return true;
  if (!PHONE_PATTERN.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 5 && digits.length <= 15;
}

function isEmail(value) {
  const s = trimTo(value, 254);
  return EMAIL_PATTERN.test(s);
}

module.exports = { isPersonName, isPlaceName, isPhone, isEmail };
