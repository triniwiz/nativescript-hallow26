// The native entry imports this before the dev-session bootstrap, so the canvas
// polyfill's XMLHttpRequest, Blob and FileReader are in place before anything fetches.
import '@nativescript/canvas-polyfill';
