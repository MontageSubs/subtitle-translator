export const BADGES_CLIENT_SCRIPT = `
(function() {
  var pills = Array.from(document.querySelectorAll('.pill-btn'));

  function copyText(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        onCopied(btn);
      }).catch(function() {
        fallbackCopy(text, btn);
      });
    } else {
      fallbackCopy(text, btn);
    }
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      onCopied(btn);
    } catch(e) {
    }
    document.body.removeChild(ta);
  }

  function onCopied(btn) {
    btn.classList.add('copied');
    var span = btn.querySelector('span');
    if (span) span.textContent = 'Copied!';
    setTimeout(function() {
      btn.classList.remove('copied');
      if (span) span.textContent = 'Copy';
    }, 1800);
  }

  function updateAriaRadio() {
    pills.forEach(function(p) {
      var targetId = p.getAttribute('for');
      var radio = targetId ? document.getElementById(targetId) : null;
      var isChecked = Boolean(radio && radio.checked);
      p.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    });
  }

  pills.forEach(function(pill, idx) {
    pill.addEventListener('mousedown', function(e) {
      e.preventDefault();
      var targetId = pill.getAttribute('for');
      if (targetId) {
        var radio = document.getElementById(targetId);
        if (radio) {
          var prevY = window.pageYOffset || document.documentElement.scrollTop;
          radio.checked = true;
          updateAriaRadio();
          if (window.scrollTo) {
            window.scrollTo({ top: prevY, left: 0, behavior: 'instant' });
          }
        }
      }
    });

    pill.addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = pill.getAttribute('for');
      if (targetId) {
        var radio = document.getElementById(targetId);
        if (radio && !radio.checked) {
          var prevY = window.pageYOffset || document.documentElement.scrollTop;
          radio.checked = true;
          updateAriaRadio();
          if (window.scrollTo) {
            window.scrollTo({ top: prevY, left: 0, behavior: 'instant' });
          }
        }
      }
    });

    pill.addEventListener('keydown', function(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        var targetId = pill.getAttribute('for');
        if (targetId) {
          var radio = document.getElementById(targetId);
          if (radio) {
            radio.checked = true;
            updateAriaRadio();
          }
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        var next = pills[(idx + 1) % pills.length];
        next.focus({ preventScroll: true });
        var nextId = next.getAttribute('for');
        if (nextId) {
          var radioNext = document.getElementById(nextId);
          if (radioNext) {
            radioNext.checked = true;
            updateAriaRadio();
          }
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = pills[(idx - 1 + pills.length) % pills.length];
        prev.focus({ preventScroll: true });
        var prevId = prev.getAttribute('for');
        if (prevId) {
          var radioPrev = document.getElementById(prevId);
          if (radioPrev) {
            radioPrev.checked = true;
            updateAriaRadio();
          }
        }
      }
    });
  });

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.copy-btn');
    if (!btn) return;
    var text = btn.getAttribute('data-copy') || '';
    if (text) copyText(text, btn);
  });
})();
`;
