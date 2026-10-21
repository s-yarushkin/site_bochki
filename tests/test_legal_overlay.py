#!/usr/bin/env python3
"""Isolated, non-production tests of narrow legal overlays."""
import importlib.util
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('legal_overlay',ROOT/'ops/legal-overlay-install.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class LegalOverlayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.live=(ROOT/'index.html').read_text(encoding='utf-8')
        cls.privacy=(ROOT/'privacy.html').read_text(encoding='utf-8')
        cls.consent=(ROOT/'consent.html').read_bytes()
        cls.contract=(ROOT/'assets/js/lead-consent.js').read_text(encoding='utf-8')

    def make_old(self):
        current=module.NOTICE_RE.search(self.live).group()
        button=module.BUTTON_RE.search(self.live).group()
        self.assertIn(current+'\n'+button,self.live)
        old='<p class="form-footnote submit-consent-notice" id="submitConsentNotice">Нажимая кнопку, вы даёте <a href="consent.html">согласие</a>. <a href="privacy.html">Политика</a>.</p>'
        return self.live.replace(current+'\n'+button,button+'\n'+old)

    def test_reconcile_current_site_preserves_journal_and_ads_masking(self):
        old=self.make_old()
        old=old.replace('</body>','<aside id="r73-journal">Recent published articles</aside></body>')
        result=module.update_index(old,self.live)
        self.assertIn('id="r73-journal"',result)
        self.assertIn('ym-hide-content',result)
        self.assertIn('Отправляя заявку, вы подтверждаете',result)
        self.assertLess(result.index('id="submitConsentNotice"'),result.index('id="submitButton"'))
        self.assertEqual(result.count('id="submitButton"'),1)
        self.assertEqual(result.count('id="submitConsentNotice"'),1)
        self.assertNotIn('Нажимая кнопку, вы даёте',result)

    def test_idempotent_dry_run_refuses_another_install(self):
        with self.assertRaisesRegex(RuntimeError,'LEGAL_ALREADY_APPLIED|ACTIVE_NOTICE_UNKNOWN'):
            # Already updated source has same nodes and returns same payload; staging gate rejects.
            changed=module.update_index(self.live,self.live)
            module.ensure(changed!=self.live,'LEGAL_ALREADY_APPLIED')

    def test_unknown_notice_fails_closed(self):
        old=self.make_old().replace('Нажимая кнопку, вы даёте','НЕПРОВЕРЕННЫЕ УСЛОВИЯ')
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_NOTICE_UNKNOWN'):
            module.update_index(old,self.live)

    def test_multiple_form_controls_fail_closed(self):
        old=self.make_old()
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_SUBMIT_BUTTON_COUNT'):
            module.update_index(old+module.BUTTON_RE.search(old).group(),self.live)

    def test_source_consent_fingerprint_is_exact(self):
        digest=module.sha256(self.consent)
        self.assertIn("CONSENT_DOCUMENT_SHA256='"+digest+"'",self.contract)
        self.assertIn("CONSENT_VERSION='2026-10-21'",self.contract)
        self.assertIn("CONSENT_METHOD='submit-button-v2'",self.contract)
        self.assertIn('113675581',self.privacy)
        self.assertIn('bdd-35@mail.ru',self.privacy)

    def test_historic_form_acceptance_contract(self):
        api=(ROOT/'server/garant-bani-relay.mjs').read_text(encoding='utf-8')
        self.assertIn("historicSubmit=value.consentVersion==='2026-10-16'",api)
        self.assertIn('fd858836a3eb8824f6db99c6f00c0e30cb77d58523582b45ea8d515965d96e2a',api)
        self.assertIn('CONSENT_METHOD_REQUIRED',api)

if __name__=='__main__':
    unittest.main()
