
var shellMake = require('shelljs/make');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var util = require('./make-util.js');

var buildPath = path.join(__dirname, '_build');
var testPath = path.join(__dirname, '_test');

target.clean = function () {
    util.rm('-Rf', buildPath);
    util.rm('-Rf', testPath);
};

// TODO: target.buildCompiledHelper
// This will only build the C# compiled helper csproj.

target.build = function() {
    target.clean();
    target.loc();

    // copy the sources
    util.mkdir('-p', path.join(buildPath, 'VstsTaskSdk'));
    util.cp('-r', path.join('VstsTaskSdk', '*'), path.join(buildPath, 'VstsTaskSdk'));

    // download externals
    var minimatchPackage = util.downloadArchive('https://www.nuget.org/api/v2/package/minimatch/1.1.0');
    util.cp(path.join(minimatchPackage, 'lib', 'portable-net40%2Bsl50%2Bwin%2Bwp80', 'Minimatch.dll'), path.join(buildPath, 'VstsTaskSdk'));

    var compiledHelperPackage = util.downloadArchive('https://vstsagenttools.blob.core.windows.net/tools/VstsTaskSdkCompiledHelpers/3/VstsTaskSdk.zip');
    util.cp(path.join(compiledHelperPackage, 'VstsTaskSdk.dll'), path.join(buildPath, 'VstsTaskSdk'));

    // stamp the version number from the package.json onto the PowerShell module definition
    var targetPsd1 = path.join(buildPath, 'VstsTaskSdk', 'VstsTaskSdk.psd1');
    var psd1Contents = fs.readFileSync(targetPsd1, 'ucs2'); // UCS-2 is a subset of UTF-16. UTF-16 is not supported by node.
    var token = "ModuleVersion = '0.1'";
    var tokenStart = psd1Contents.indexOf(token);
    if (tokenStart < 0) {
        throw new Error('ModuleVersion token not found in PSD1.');
    }

    var packageJson = require('./package.json');
    psd1Contents = psd1Contents.substring(0, tokenStart) + "ModuleVersion = '" + packageJson.version + "'" + psd1Contents.substring(tokenStart + token.length);

    // stamp the commit hash onto the PowerShell module definition
    token = "_COMMIT_HASH_";
    tokenStart = psd1Contents.indexOf(token);
    if (tokenStart < 0) {
        throw new Error('Commit hash token not found in PSD1.');
    }

    var commitHash = util.run('git rev-parse HEAD', 'pipe');
    if (!commitHash) {
        throw new Error('Failed to determine commit hash.');
    }
    psd1Contents = psd1Contents.substring(0, tokenStart) + commitHash + psd1Contents.substring(tokenStart + token.length);

    // save the updated psd1 file
    fs.writeFileSync(targetPsd1, psd1Contents, 'ucs2');
}

target.test = function() {
    util.ensureTool('tsc', '--version', 'Version 1.8.7');
    util.ensureTool('mocha', '--version', '5.2.0');
    target.build();

    util.mkdir('-p', testPath);
    util.run(`tsc --outDir "${testPath}" --module commonjs --rootDir Tests Tests/lib/psRunner.ts`);
    util.run(`tsc --outDir "${testPath}" --rootDir Tests Tests/L0/_suite.ts`);
    util.cp('-r', path.join('Tests', '*'), testPath);
    util.run('mocha "' + path.join(testPath, 'L0', '_suite.js') + '"');
}

target.loc = function() {
    // build the content for the en-US resjson file
    var lib = require('./VstsTaskSdk/lib.json');
    var strPath = path.join('VstsTaskSdk', 'Strings', 'resources.resjson', 'en-US');
    util.mkdir('-p', strPath);
    var strings = { };
    if (lib.messages) {
        for (var key in lib.messages) {
            var messageKey = 'loc.messages.' + key;
            strings[messageKey] = lib.messages[key];
        }
    }

    // create the en-US resjson file
    var enPath = path.join(strPath, 'resources.resjson');
    var enContents = JSON.stringify(strings, null, 2);
    fs.writeFileSync(enPath, enContents);
}
