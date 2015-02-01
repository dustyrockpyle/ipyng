angular.module('ng.lodash', []).
    factory('_', function($window){
        $window._.templateSettings.interpolate = /{{([\s\S]+?)}}/g;
        return $window._;
    });