export const CLIENT_SCRIPT = `    (function() {
      var toggleBtn = document.getElementById('tz-toggle');
      var tzProfiles = {
        '-12': { o: 'MDY', c: '12h' },
        '-11': { o: 'MDY', c: '12h' },
        '-10': { o: 'MDY', c: '12h' },
        '-9': { o: 'MDY', c: '12h' },
        '-8': { o: 'MDY', c: '12h' },
        '-7': { o: 'MDY', c: '12h' },
        '-6': { o: 'MDY', c: '12h' },
        '-5': { o: 'MDY', c: '12h' },
        '-4': { o: 'MDY', c: '12h' },
        '-3.5': { o: 'MDY', c: '12h' },
        '-3': { o: 'DMY', c: '24h' },
        '-2': { o: 'DMY', c: '24h' },
        '-1': { o: 'DMY', c: '24h' },
        '0': { o: 'DMY', c: '24h' },
        '1': { o: 'DMY', c: '24h' },
        '2': { o: 'DMY', c: '24h' },
        '3': { o: 'DMY', c: '24h' },
        '3.5': { o: 'DMY', c: '24h' },
        '4': { o: 'DMY', c: '24h' },
        '4.5': { o: 'DMY', c: '24h' },
        '5': { o: 'DMY', c: '24h' },
        '5.5': { o: 'DMY', c: '12h' },
        '5.75': { o: 'DMY', c: '12h' },
        '6': { o: 'DMY', c: '12h' },
        '6.5': { o: 'DMY', c: '12h' },
        '7': { o: 'DMY', c: '24h' },
        '8': { o: 'YMD', c: '24h' },
        '9': { o: 'YMD', c: '24h' },
        '9.5': { o: 'DMY', c: '12h' },
        '10': { o: 'DMY', c: '12h' },
        '10.5': { o: 'DMY', c: '12h' },
        '11': { o: 'DMY', c: '24h' },
        '12': { o: 'DMY', c: '12h' },
        '12.75': { o: 'DMY', c: '12h' },
        '13': { o: 'DMY', c: '12h' },
        '14': { o: 'DMY', c: '12h' }
      };

      function formatLocalTimestamp(isoString) {
        var d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;

        var offsetMin = -d.getTimezoneOffset();
        var sign = offsetMin >= 0 ? '+' : '-';
        var absMin = Math.abs(offsetMin);
        var hOff = Math.floor(absMin / 60);
        var mOff = absMin % 60;
        var offKey = String((offsetMin >= 0 ? 1 : -1) * (hOff + (mOff / 60)));

        var prof = tzProfiles[offKey] || (offsetMin < 0 ? { o: 'MDY', c: '12h' } : { o: 'DMY', c: '24h' });
        var gmtStr = offsetMin === 0 ? 'UTC' : ('GMT' + sign + hOff + (mOff > 0 ? ':' + (mOff < 10 ? '0' : '') + mOff : ''));

        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var m = months[d.getMonth()];
        var day = d.getDate();
        var h = d.getHours();
        var min = d.getMinutes();
        var minStr = min < 10 ? '0' + min : '' + min;

        var dateStr = '';
        if (prof.o === 'YMD') {
          var monNum = d.getMonth() + 1;
          var monNumStr = monNum < 10 ? '0' + monNum : '' + monNum;
          var dayStr = day < 10 ? '0' + day : '' + day;
          dateStr = monNumStr + '-' + dayStr;
        } else if (prof.o === 'MDY') {
          dateStr = m + ' ' + day;
        } else {
          dateStr = day + ' ' + m;
        }

        var timeStr = '';
        if (prof.c === '12h') {
          var period = h >= 12 ? 'p.m.' : 'a.m.';
          var h12 = h % 12;
          if (h12 === 0) h12 = 12;
          timeStr = h12 + ':' + minStr + ' ' + period;
        } else {
          var h24Str = h < 10 ? '0' + h : '' + h;
          timeStr = h24Str + ':' + minStr;
        }

        return dateStr + ', ' + timeStr + ' ' + gmtStr;
      }

      function applyTimezone(mode) {
        var isLocal = mode === 'local';
        var timeElements = document.querySelectorAll('time[datetime]');
        for (var i = 0; i < timeElements.length; i++) {
          var el = timeElements[i];
          var dt = el.getAttribute('datetime');
          if (!dt) continue;
          if (isLocal) {
            el.textContent = formatLocalTimestamp(dt);
          } else {
            var utc = el.getAttribute('data-utc');
            if (utc) {
              el.textContent = utc;
            }
          }
        }
        if (toggleBtn) {
          toggleBtn.textContent = isLocal ? 'Time: Local' : 'Time: UTC';
          if (isLocal) {
            toggleBtn.setAttribute('title', 'Click to switch to UTC time');
            toggleBtn.setAttribute('aria-label', 'Current display: Local time. Click to switch to UTC');
          } else {
            toggleBtn.setAttribute('title', 'Click to switch to Local time');
            toggleBtn.setAttribute('aria-label', 'Current display: UTC time. Click to switch to local time');
          }
        }
      }

      var tzWrap = document.getElementById('tz-control-wrap');
      var tzCheckbox = document.getElementById('tz-state-checkbox');

      if (tzWrap && tzCheckbox && toggleBtn) {
        tzWrap.style.display = 'inline-flex';

        function syncState() {
          applyTimezone(tzCheckbox.checked ? 'local' : 'utc');
        }

        if (tzCheckbox.checked) {
          syncState();
        }

        toggleBtn.addEventListener('click', function() {
          tzCheckbox.checked = !tzCheckbox.checked;
          syncState();
        });

        tzCheckbox.addEventListener('change', syncState);
      }

      function initIncidentDeepLinks() {
        var items = document.querySelectorAll('details.incident-item');
        for (var i = 0; i < items.length; i++) {
          items[i].addEventListener('toggle', function(e) {
            var t = e.currentTarget;
            var targetId = t ? t.getAttribute('data-id') : null;
            if (!t || !targetId || !window.history || !window.history.replaceState) return;
            if (t.open && window.location.hash !== '#' + targetId) {
              window.history.replaceState(null, '', '#' + targetId);
            } else if (!t.open && window.location.hash === '#' + targetId) {
              window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
            }
          });
        }
      }

      function expandTargetHash() {
        var hash = window.location.hash;
        if (!hash) return;
        var id = hash.replace(/^#/, '');
        if (!id) return;
        var el = document.getElementById(id);
        if (el) {
          var detailsParent = el.closest ? el.closest('details.incident-item') : null;
          if (detailsParent) {
            detailsParent.open = true;
          } else if (el.tagName === 'DETAILS') {
            el.open = true;
          }
          var parentGroup = el.closest ? el.closest('details.month-group') : null;
          if (parentGroup) {
            parentGroup.open = true;
          }
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
      initIncidentDeepLinks();
      window.addEventListener('hashchange', expandTargetHash);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', expandTargetHash);
      } else {
        expandTargetHash();
      }
    })();
`;
