import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { withCheckConfig } from '../../core/pack/check-config.js';
import { GAMEBOOK_CHECKERS } from './checkers/index.js';
export const loadGamebookPack = async () => withCheckConfig(await loadYamlPack(import.meta.dirname, {
  name: 'gamebook', checkers: GAMEBOOK_CHECKERS, modules: ['checkers/index.js', 'checkers/facts.js', 'checkers/structure.js'],
}));
