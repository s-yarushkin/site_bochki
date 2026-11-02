import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('home_hero_build', ROOT / 'concepts/home-hero/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class HeroScopeTest(unittest.TestCase):
    def test_original_catalogue_dialog_and_r117_application_are_unchanged(self):
        original = build.BASELINE.read_text('utf-8')
        replacement = (build.HERE / 'hero.html').read_text('utf-8')
        result, _ = build.compose(original, replacement)
        old_tail = re.search(r'<section class="hero"[^>]*>.*?</section>(.*)', original, re.S)[1]
        new_tail = result.split(replacement, 1)[1].replace('<script type="module" src="/home-hero/hero.mjs"></script>', '')
        self.assertEqual(new_tail, old_tail)
        self.assertIn('quiz.mjs?v=r117-goals-', new_tail)
        self.assertEqual(result.count('<h1'), 1)

    def test_unknown_or_already_modified_hero_is_rejected(self):
        original = build.BASELINE.read_text('utf-8')
        with self.assertRaisesRegex(RuntimeError, 'exactly one original hero'):
            build.compose(original.replace('class="hero"', 'class="unknown-hero"'), '<section></section>')
        with self.assertRaisesRegex(RuntimeError, 'not the reviewed home'):
            build.compose(original.replace('r117-goals-', 'unknown-goals-'), '<section></section>')


if __name__ == '__main__':
    unittest.main()
