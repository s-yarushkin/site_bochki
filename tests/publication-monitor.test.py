import importlib.util,subprocess,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('publication_watch',Path(__file__).resolve().parents[1]/'scripts/watch-reviewed-publication.py');watch=importlib.util.module_from_spec(spec);spec.loader.exec_module(watch)

class PublicationMonitor(unittest.TestCase):
 def test_connection_loss_does_not_lose_saved_success(self):
  receipt={'ok':True,'release':'CONSENT-111111111111','checks':{'invalid_lead_rejected':True}};phases=[]
  results=[subprocess.CalledProcessError(255,['ssh']),{'status':{'status':'running'},'result':None},{'status':{'status':'published'},'result':receipt}]
  with patch.object(watch,'read_publication',side_effect=results) as read,patch.object(watch.time,'sleep'):
   self.assertEqual(watch.wait_publication('/tmp/dachapar-consent-111111111111',progress=lambda data:phases.append(data['status'])),receipt)
   self.assertEqual(read.call_count,3)
  self.assertEqual(phases,['connection_lost','running','published'])
 def test_saved_failure_is_reported_without_relaunch(self):
  receipt={'ok':False,'message':'Protected inventory changed'}
  with patch.object(watch,'read_publication',return_value={'status':{'status':'stopped'},'result':receipt}) as read,patch.object(watch.subprocess,'run') as process:
   self.assertEqual(watch.wait_publication('/tmp/dachapar-consent-111111111111'),receipt)
   self.assertEqual(read.call_count,1);process.assert_not_called()

if __name__=='__main__':unittest.main()
