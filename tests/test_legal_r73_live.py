"""Contract regression tests for the ACTUAL premium R73 form shape (not old R7)."""
import importlib.util
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('legal_r73',ROOT/'ops/legal-r73-live-install.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class R73ExactFormTests(unittest.TestCase):
    def old_index(self):
        return (
            '<!doctype html><html lang="ru"><head>'+
            module.OLD_SCRIPT+
            '</head><body><section id="journal">STAY_UNCHANGED</section>'
            '<form id="relay-lead-form" action="/api/lead">'+
            module.OLD_FORM_AREA+
            'Do not change phone, calculator or manager</form></body></html>'
        )

    def old_app(self):
        return (
            module.APP_IMPORT+'\n'
            "const preservePriceLogic='KEEP_R73_PRICEBOOK';\n"
            "analytics.confirmed(result.receipt,{flow,requestId:payload.requestId});\n"
            "    const result = await submitLead(payload,settings,location.origin);\n"
            +module.OLD_APP_CALL+
            "const preservedAuth='KEEP_MANAGER_UNCHANGED';\n"
        )

    def test_exact_premium_relay_consent_moves_before_submit(self):
        old=self.old_index()
        result=module.adjust_index(old)
        self.assertIn('STAY_UNCHANGED',result)
        self.assertIn('Do not change phone, calculator or manager',result)
        self.assertLess(result.index('id="relay-consent"'),result.index('id="relay-submit"'))
        self.assertIn('Отправляя заявку, вы подтверждаете',result)
        self.assertIn('consent.html',result)
        self.assertIn('privacy.html',result)
        self.assertIn(module.NEW_SCRIPT,result)
        self.assertNotIn(module.OLD_SCRIPT,result)
        self.assertEqual(result.count('id="relay-consent"'),1)
        self.assertEqual(result.count('id="relay-submit"'),1)
        self.assertNotIn('Нажимая кнопку',result)

    def test_unknown_legacy_form_rejected_not_overwritten(self):
        old=self.old_index().replace('id="relay-submit"','id="submitButton"')
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_RELAY_CONTROLS_CHANGED'):
            module.adjust_index(old)
        with self.assertRaisesRegex(RuntimeError,'R73_FORM_NEIGHBORHOOD_CHANGED'):
            module.adjust_index(self.old_index().replace('Нажимая кнопку','Старый текст иной'))

    def test_premium_app_only_augments_payload_not_analytics_or_price(self):
        old=self.old_app()
        new=module.adjust_app(old)
        self.assertIn(module.APP_IMPORT,new)
        self.assertIn("payload.consent = true;",new)
        self.assertIn("payload.consentVersion = '2026-10-21';",new)
        self.assertIn("payload.consentMethod = 'submit-button-v2';",new)
        self.assertIn("KEEP_R73_PRICEBOOK",new)
        self.assertIn("KEEP_MANAGER_UNCHANGED",new)
        self.assertIn("analytics.confirmed(result.receipt,{flow,requestId:payload.requestId})",new)
        self.assertIn("const result = await submitLead(payload,settings,location.origin)",new)
        self.assertEqual(new.count("payload.consentVersion = '2026-10-21'"),1)
        with self.assertRaisesRegex(RuntimeError,'R73_LEAD_BUILDER_CHANGED'):
            module.adjust_app(new)

    def test_missing_import_or_verified_receipt_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError,'R73_LEAD_CLIENT_IMPORT_CHANGED'):
            module.adjust_app(self.old_app().replace('lead-client.mjs','removed-client.mjs'))
        with self.assertRaisesRegex(RuntimeError,'R73_CONFIRMED_CONVERSION_CHANGED'):
            module.adjust_app(self.old_app().replace('analytics.confirmed','analytics.fake'))

    def test_live_baseline_pins_real_owner_supplied_sha(self):
        self.assertEqual(module.INDEX_SHA256,
                         '7b05a754a969f8253c7eb9f90560a53219300a18e612e060daa0604abe3c7c18')
        self.assertEqual(module.APP_SHA256,
                         'd2701ccb6549b9a64b99f7bc5a622536b94e6d1a96fef9503618fc641547fd00')
        self.assertEqual(module.API_GIT_BLOB,
                         'ed4be4b02be5cae25107e08e465dcd3f8dcf7d6d')
        self.assertIn('id="relay-submit"',module.OLD_BUTTON)
        self.assertNotIn('submitButton',module.OLD_FORM_AREA)

if __name__=='__main__':
    unittest.main()
