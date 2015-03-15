from IPython.html.base.handlers import json_errors, IPythonHandler
from IPython.html.services.kernels.kernelmanager import MappingKernelManager
from IPython.html.utils import url_path_join, url_escape
from zmq.eventloop import ioloop
from zmq.utils import jsonapi

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
    def get(self):
        self.redirect('/test/index.html')


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
    def __init__(self, kernel_manager):
        handlers = [
            (r"/", IndexHandler),
            (r"/api/startkernel/", StartKernelHandler),
            (r"/api/kernels/%s" % _kernel_id_regex, KernelHandler),
            (r"/api/kernels/%s/%s" % (_kernel_id_regex, _kernel_action_regex), KernelActionHandler),
            (r"/api/kernels/%s/channels" % _kernel_id_regex, ZMQChannelsHandler),
            (r"/(.*)", web.StaticFileHandler, dict(path=os.path.join(os.path.dirname(__file__), r'../build')))
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

def main():
    kernel_manager = MappingKernelManager()

    logging.basicConfig(level=logging.INFO)
    app = WebApp(kernel_manager)
    server = httpserver.HTTPServer(app)
    server.listen(8000, '127.0.0.1')
    app_log.info("Serving at http://127.0.0.1:8000")
    try:
        ioloop.IOLoop.instance().start()
    except KeyboardInterrupt:
        app_log.info("Interrupted...")
    finally:
        kernel_manager.shutdown_all()


if __name__ == '__main__':
    main()