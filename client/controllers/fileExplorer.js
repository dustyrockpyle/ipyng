(function(angular){
  angular.module('ipy.fileExplorer', ['ipyng'])
    .controller('ipyFileExplorerCtrl', ipyFileExplorerCtrl);

  function ipyFileExplorerCtrl (kernel, $q) {
    var self = this,
      dir_code = 'json.dumps([{"name": name, "isfile": os.path.isfile(name)} for name in os.listdir()])',
      curdir_code = 'json.dumps(os.path.abspath("."))';

    self.curdir = $q.when();
    self.dir = $q.when();
    self.upLevel = upLevel;
    self.navigate = navigate;
    self.read = read;
    var curDeferred = $q.defer();
    self.curdir = curDeferred.promise;
    var dirDeferred = $q.defer();
    self.dir = dirDeferred.promise;
    kernel.executeSilent('import os; import json');
    self.lastNavigated = null;

    updateDirectory();
    function updateDirectory () {
      return kernel.evaluate([dir_code, curdir_code])
        .then(function (result) {
          dirDeferred.resolve(JSON.parse(result[0].text.slice(1, -1)));
          curDeferred.resolve(JSON.parse(result[1].text.slice(1, -1)));
        });
    }

    function upLevel () {
      return navigate('..');
    }

    function navigate (path) {
      if(path == self.lastNavigated) return self.curdir;
      self.lastNavigated = path;
      self.lastNavigated = path;
      curDeferred = $q.defer();
      self.curdir = curDeferred.promise;
      dirDeferred = $q.defer();
      self.dir = dirDeferred.promise;
      return kernel.executeSilent('os.chdir(r"' + path +'")')
        .then(updateDirectory)
    }

    function read (filename) {
      return kernel.evaluate('open(r"' + filename + '").read()')
        .then(function(result){
          return result.text.slice(1, -1);
        });
    }
  }
})(angular);