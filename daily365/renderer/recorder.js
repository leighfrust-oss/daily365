// Thin wrapper around MediaRecorder. Records a MediaStream (canvas video + audio) to a Blob.

// MP4 with H.264 + AAC is preferred because every social app accepts it. WebM is the fallback.
// A plain 'video/mp4' is deliberately not listed: some builds then record VP9 inside an MP4,
// which many upload forms reject.
const CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType() {
  return CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function extensionFor(mime) {
  return String(mime).startsWith('video/mp4') ? 'mp4' : 'webm';
}

export function startRecording(stream, mimeType) {
  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 128_000,
  });

  const finished = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    recorder.onerror = (e) => reject(e.error || new Error('Recording failed'));
  });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(250);

  return {
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
      return finished;
    },
  };
}
