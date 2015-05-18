(function(angular){
  angular.module('ipy.fileExplorer', ['ipyng'])
    .controller('ipyFileExplorerCtrl', ipyFileExplorerCtrl);

  function ipyFileExplorerCtrl (kernel, $q) {
    var self = this,
      dir_code = 'JSON([{"name": name, "isfile": os.path.isfile(name)} for name in os.listdir()])',
      curdir_code = 'JSON([os.path.abspath(".")])';

    self.curdir = $q.when();
    self.dir = $q.when();
    self.upLevel = upLevel;
    self.navigate = navigate;
    self.read = read;
    var curDeferred = $q.defer();
    self.curdir = curDeferred.promise;
    var dirDeferred = $q.defer();
    self.dir = dirDeferred.promise;
    self.lastNavigated = null;
    kernel.executeSilent("import os; import json\n" +
    "class JSON:\n" +
    " def __init__(self, rep):\n" +
    "  self.rep = rep\n" +
    " def _repr_json_(self):\n" +
    "  return json.dumps(self.rep)\n");

    updateDirectory();
    function updateDirectory () {
      return kernel.evaluate([dir_code, curdir_code])
        .then(function (result) {
          dirDeferred.resolve(result[0].data['application/json']);
          curDeferred.resolve(result[1].data['application/json'][0]);
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
      return kernel.evaluate('JSON([open(r"' + filename + '").read()])')
        .then(function(result){
          return result.data['application/json'][0];
        });
    }
  }
})(angular);