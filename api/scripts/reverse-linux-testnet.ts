import {parseLinuxNativeArgs,runLinuxNative} from '../src/linux-native-runner.ts';
try{console.log(JSON.stringify(await runLinuxNative('reverse',parseLinuxNativeArgs('reverse',process.argv.slice(2)))));}
catch{console.error(JSON.stringify({status:'LINUX_REVERSE_BLOCKED_RECONCILE_ORIGINAL_JOURNAL',financialActionMayBeJournaled:true}));process.exitCode=1;}
