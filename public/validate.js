window.CAREPOINT_VALIDATE = (function () {
  var NAME_RE = /^[\p{L}]+(?:[ .'-][\p{L}]+)*$/u;
  var PLACE_RE = /^[\p{L}]+(?:[ .,'-][\p{L}]+)*$/u;
  var PHONE_RE = /^\+?[\d\s().-]{5,24}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function isPersonName(value) {
    var s = String(value || '').trim();
    return s.length >= 1 && NAME_RE.test(s);
  }

  function isPlaceName(value) {
    var s = String(value || '').trim();
    return s.length === 0 || PLACE_RE.test(s);
  }

  function isPhone(value) {
    var s = String(value || '').trim();
    if (s.length === 0) return true;
    if (!PHONE_RE.test(s)) return false;
    var digits = s.replace(/\D/g, '');
    return digits.length >= 5 && digits.length <= 15;
  }

  function isEmail(value) {
    return EMAIL_RE.test(String(value || '').trim());
  }

  function lettersOnly(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      input.value = input.value.replace(/[^\p{L} .'-]/gu, '');
    });
  }

  function placeOnly(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      input.value = input.value.replace(/[^\p{L} .,'-]/gu, '');
    });
  }

  function phoneOnly(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      input.value = input.value.replace(/[^\d\s()+.-]/g, '');
    });
  }

  return {
    isPersonName: isPersonName,
    isPlaceName: isPlaceName,
    isPhone: isPhone,
    isEmail: isEmail,
    lettersOnly: lettersOnly,
    placeOnly: placeOnly,
    phoneOnly: phoneOnly
  };
})();
