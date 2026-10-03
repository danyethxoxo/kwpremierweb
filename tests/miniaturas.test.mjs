import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { crearMiniatura } from '../herramientas/generar-miniaturas.mjs';

test('la miniatura es WebP de 800x600 y conserva intacta la imagen original', async () => {
  const original = await sharp({create:{width:2000,height:1500,channels:3,background:'#b61d35'}}).png().toBuffer();
  const copy = Buffer.from(original);
  const thumb = await crearMiniatura(original);
  const metadata = await sharp(thumb).metadata();
  assert.equal(metadata.format,'webp');
  assert.equal(metadata.width,800);
  assert.equal(metadata.height,600);
  assert(thumb.length<250000);
  assert.deepEqual(original,copy);
});
