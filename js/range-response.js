/* Slice a cached full-body response to satisfy a Range request (HTTP 206).
   iOS Safari requests media in byte ranges and expects 206 + Content-Range.
   Returning a cached 200 body unchanged can truncate or stall playback.
   Works in a service worker (importScripts) and in Node tests (module.exports). */
(function (root) {
  'use strict';

  function parseRange(header, size) {
    if (!header || size <= 0) return null;
    var m = /^bytes=(\d*)-(\d*)$/i.exec(String(header).trim());
    if (!m) return null;
    var start = m[1] === '' ? null : Number(m[1]);
    var end = m[2] === '' ? null : Number(m[2]);
    if (start == null && end == null) return null;
    if (start == null) {
      // suffix: bytes=-500 means the last 500 bytes
      var suffix = end;
      if (!suffix) return null;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      if (start >= size) return { unsatisfiable: true, size: size };
      if (end == null || isNaN(end) || end >= size) end = size - 1;
      if (end < start) return { unsatisfiable: true, size: size };
    }
    if (isNaN(start) || isNaN(end)) return null;
    return { start: start, end: end, size: size };
  }

  function sliceRangeResponse(req, res) {
    if (!req || !res || res.status !== 200) return Promise.resolve(res);
    var header = null;
    try { header = req.headers.get('Range') || req.headers.get('range'); } catch (e) { header = null; }
    if (!header) return Promise.resolve(res);
    return res.clone().arrayBuffer().then(function (buf) {
      var size = buf.byteLength;
      var range = parseRange(header, size);
      if (!range) return res;
      if (range.unsatisfiable) {
        return new Response(null, {
          status: 416,
          statusText: 'Range Not Satisfiable',
          headers: {
            'Content-Range': 'bytes */' + size,
            'Accept-Ranges': 'bytes'
          }
        });
      }
      var slice = buf.slice(range.start, range.end + 1);
      var headers = new Headers(res.headers);
      headers.set('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + size);
      headers.set('Content-Length', String(slice.byteLength));
      headers.set('Accept-Ranges', 'bytes');
      return new Response(slice, { status: 206, statusText: 'Partial Content', headers: headers });
    });
  }

  var api = { parseRange: parseRange, sliceRangeResponse: sliceRangeResponse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.parseRange = parseRange;
    root.sliceRangeResponse = sliceRangeResponse;
  }
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
