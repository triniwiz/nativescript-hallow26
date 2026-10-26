// The canvas API without the <Canvas> view. A Worker imports it first.
import '@nativescript/canvas/worker';
import { serveDemo } from '../canvas/worker-demo';
import { wisps } from './wisps';

serveDemo(wisps());
