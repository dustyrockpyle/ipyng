angular.module('test', [
  'ipyng',
  'templates',
  'ng.lodash',
  'md.notebook',
  'ipy.psutil',
  'ipy.watch',
  'ipy.debugger',
  'ipy.codecell',
  'test.routes'
])
  .config(function($provide){
    $provide.decorator('ipyMessageHandler', function($delegate, $log, ipyMessage){
      var iopub = $delegate.handleIopubMessage;
      var shell = $delegate.handleShellReply;
      $delegate.handleIopubMessage = function(message){
        $log.log('Iopub ' + ipyMessage.getMessageType(message) + ' Message:');
        $log.log(message);
        return iopub(message);
      };
      $delegate.handleShellReply = function(message){
        $log.log('Shell ' + ipyMessage.getMessageType(message) + ' Message:');
        $log.log(message);
        return shell(message);
      };
      return $delegate;
    });
  });