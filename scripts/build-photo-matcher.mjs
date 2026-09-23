// Self-host pinned face comparison code and only the models this feature uses.
import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
export async function buildPhotoMatcher(output){
  const source='node_modules/@vladmandic/face-api',target=path.join(output,'vendor/face-api');
  await mkdir(path.join(target,'models'),{recursive:true});
  await copyFile(path.join(source,'dist/face-api.js'),path.join(target,'face-api.js'));
  await copyFile(path.join(source,'LICENSE'),path.join(target,'LICENSE'));
  for(const model of ['ssd_mobilenetv1_model','face_landmark_68_model','face_recognition_model'])for(const suffix of ['.bin','-weights_manifest.json'])await copyFile(path.join(source,'model',model+suffix),path.join(target,'models',model+suffix));
}
