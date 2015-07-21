
function findCryptoFiles(context, dir) {
    var path              = context.requireCordovaModule('path'),
        fs                = context.requireCordovaModule('fs');

    var fileList = [];
    var list = fs.readdirSync(dir);
    list.filter(function(file) {
        return fs.statSync(path.join(dir, file)).isFile() && /.*\.(htm|html|js|css)$/.test(file);
    }).forEach(function(file) {
        fileList.push(path.join(dir, file));
    });
    // sub dir
    list.filter(function(file) {
        return fs.statSync(path.join(dir, file)).isDirectory();
    }).forEach(function(file) {
        var subDir = path.join(dir, file)
        var subFileList = findCryptoFiles(context, subDir);
        fileList = fileList.concat(subFileList);
    });

    return fileList;
}

function encryptData(input, key, iv) {
    var crypto = require("crypto");

    var cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    var encrypted = cipher.update(input, 'utf8', 'base64') + cipher.final('base64');

    return encrypted;
}

function replaceCryptKey_ios(pluginDir, key, iv) {
    var path = require('path');
    var fs = require('fs');

    var sourceFile = path.join(pluginDir, 'CDVCryptURLProtocol.m');
    var content = fs.readFileSync(sourceFile, 'utf-8');

    content = content.replace(/kCryptKey = @".*";/, 'kCryptKey = @"' + key + '";')
                     .replace(/kCryptIv = @".*";/, 'kCryptIv = @"' + iv + '";');

    fs.writeFileSync(sourceFile, content, 'utf-8');
}

function replaceCryptKey_android(pluginDir, key, iv) {
    var path = require('path');
    var fs = require('fs');

    var sourceFile = path.join(pluginDir, 'com/tkyaji/cordova/DecryptResource.java');
    var content = fs.readFileSync(sourceFile, 'utf-8');

    content = content.replace(/CRYPT_KEY = ".*";/, 'CRYPT_KEY = "' + key + '";')
                     .replace(/CRYPT_IV = ".*";/, 'CRYPT_IV = "' + iv + '";');

    fs.writeFileSync(sourceFile, content, 'utf-8');
}

module.exports = function(context) {

    var path              = context.requireCordovaModule('path'),
        fs                = context.requireCordovaModule('fs'),
        Q                 = context.requireCordovaModule('q'),
        crypto            = context.requireCordovaModule('crypto'),
        cordova_util      = context.requireCordovaModule('cordova-lib/src/cordova/util'),
        platform          = context.requireCordovaModule('cordova-lib/src/cordova/platform'),
        platforms         = context.requireCordovaModule('cordova-lib/src/platforms/platforms'),
        ConfigParser      = context.requireCordovaModule('cordova-lib/src/configparser/ConfigParser');

    var deferral = new Q.defer();
    var projectRoot = cordova_util.cdProjectRoot();
    var platformsOnFs = cordova_util.listPlatforms(projectRoot);

    var key = crypto.randomBytes(24).toString('base64');
    var iv = crypto.randomBytes(12).toString('base64');

    console.log("key=" + key + ", iv=" + iv)

    platformsOnFs.map(function(platform) {
        var platformPath = path.join(projectRoot, 'platforms', platform);
        var parser = platforms.getPlatformProject(platform, platformPath);
        var wwwDir = parser.www_dir()

        findCryptoFiles(context, wwwDir).forEach(function(file) {
            var content = fs.readFileSync(file, 'utf-8');
            fs.writeFileSync(file, encryptData(content, key, iv), 'utf-8');
            console.log("encrypt: " + file);
        });

        var platformPath = path.join(projectRoot, 'platforms', platform);
        var project = parser.parseProjectFile(platformPath);
        if (platform == 'ios') {
            var pluginDir = path.join(project.xcode_path, 'Plugins', context.opts.plugin.id);
            replaceCryptKey_ios(pluginDir, key, iv);

        } else if (platform == 'android') {
            var pluginDir = path.join(project.projectDir, 'src');
            replaceCryptKey_android(pluginDir, key, iv);

            var cfg = new ConfigParser(parser.config_xml());
            cfg.doc.getroot().getchildren().filter(function(child, idx, arr) {
                return (child.tag == 'content');
            }).map(function(child) {
                if (!child.attrib.src .match(/^https?:\/\//)) {
                    child.attrib.src = 'http://localhost/' + child.attrib.src;
                }
            });
            cfg.write();
        }
    });

    deferral.resolve();
    return deferral.promise;
}