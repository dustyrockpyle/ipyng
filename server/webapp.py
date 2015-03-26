from IPython.html.base.handlers import json_errors, IPythonHandler
from IPython.html.services.kernels.kernelmanager import MappingKernelManager
from IPython.html.utils import url_path_join, url_escape
from zmq.eventloop import ioloop
from zmq.utils import jsonapi
from yaml_tags import register_tags
import yaml
import sys
import os

ioloop.install()

import os
import logging
from tornado import httpserver
from tornado import web
from tornado.log import app_log

from IPython.html.services.kernels.handlers import (
    KernelHandler, KernelActionHandler, ZMQChannelsHandler)

from IPython.html.services.kernels.handlers import _kernel_action_regex, _kernel_id_regex


class IndexHandler(web.RequestHandler):
    def initialize(self, path=None):
        self.index_path = path

    def get(self, *args, **kwargs):
        with open(self.index_path) as f:
            self.write(f.read())


class StartKernelHandler(IPythonHandler):
    @web.authenticated
    @json_errors
    def post(self):
        km = self.kernel_manager
        kernel_id = km.start_kernel()
        model = km.kernel_model(kernel_id)
        location = url_path_join(self.base_url, 'api', 'kernels', kernel_id)
        self.set_header('Location', url_escape(location))
        self.set_status(201)
        self.finish(jsonapi.dumps(model))


class WebApp(web.Application):
    def __init__(self, kernel_manager, static_path, index_path, static_url):
        handlers = [
            (r"/", IndexHandler, dict(path=index_path)),
            (r"/api/startkernel/", StartKernelHandler),
            (r"/api/kernels/%s" % _kernel_id_regex, KernelHandler),
            (r"/api/kernels/%s/%s" % (_kernel_id_regex, _kernel_action_regex), KernelActionHandler),
            (r"/api/kernels/%s/channels" % _kernel_id_regex, ZMQChannelsHandler),
            (r'{}(.*)'.format(static_url), web.StaticFileHandler, dict(path=static_path)),
        ]

        settings = dict(
            static_url_prefix="/",
            cookie_secret='secret',
            cookie_name='ignored',
            kernel_manager=kernel_manager,
        )

        super(WebApp, self).__init__(handlers, **settings)


##############################################################################
# start the app
##############################################################################

def main(config_path=None):
    if config_path is None:
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')
    root = os.path.dirname(config_path)
    register_tags(root)
    config = yaml.load(open(config_path))
    static_path = config['paths']['static']
    index_path = config['paths']['index']
    static_url = config['static_url']
    port = config['ipython_port']
    kernel_manager = MappingKernelManager()

    logging.basicConfig(level=logging.INFO)
    app = WebApp(kernel_manager, static_path, index_path, static_url)
    server = httpserver.HTTPServer(app)
    server.listen(port, '127.0.0.1')
    app_log.info("Serving at http://127.0.0.1:{}".format(port))
    try:
        ioloop.IOLoop.instance().start()
    except KeyboardInterrupt:
        app_log.info("Interrupted...")
    finally:
        kernel_manager.shutdown_all()


if __name__ == '__main__':
    config_path = None
    if len(sys.argv) == 2:
        config_path = sys.argv[1]
    main(config_path=config_path)