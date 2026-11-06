import importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('social_preview',ROOT/'scripts/social_preview.py');social=importlib.util.module_from_spec(spec);spec.loader.exec_module(social)
class PreviewTest(unittest.TestCase):
 def test_only_preview_changes(self):
  original=b'<html><head><meta property="og:title" content="Existing title"><script>keep()</script><meta content="old.webp" property="og:image"><link href="old.css"><meta name="twitter:card" content="summary"><meta name="twitter:image" content="old.png"></head><body data-id="hero">CATALOG<script>unchanged()</script></body></html>'
  patched=social.patch_preview(original);self.assertEqual(patched.split(b'</head>')[1],original.split(b'</head>')[1]);self.assertIn(b'<meta property="og:title" content="Existing title">',patched);self.assertIn(b'<script>keep()</script>',patched);self.assertIn(b'<link href="old.css">',patched);self.assertNotIn(b'old.webp',patched);self.assertEqual(patched.count(b'property="og:image"'),1);self.assertEqual(patched.count(b'name="twitter:image"'),1);self.assertIn(b'width" content="1732"',patched);self.assertEqual(social.patch_preview(patched),patched)
 def test_add_missing_and_ignore_body(self):
  original=b'<html><head><title>Title</title></head><body><meta property="og:image" content="body-tag"></body></html>';patched=social.patch_preview(original);self.assertIn(b'body-tag',patched);self.assertEqual(patched.split(b'</head>')[1],original.split(b'</head>')[1])
 def test_missing_head_refused(self):
  with self.assertRaisesRegex(ValueError,'HEAD_REQUIRED'):social.patch_preview(b'<body>hello</body>')
if __name__=='__main__':unittest.main()
