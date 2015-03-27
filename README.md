# ipyng

This is a work in progress library for creating web frontends to IPython kernels, similar to the IPython Notebook.

The aim is to provide an easy way to create modular components (directives in AngularJS) that you can link together
to create simple UIs for any language with an IPython kernel.

I'm interested in feedback anyone may have for improving the api, and I'd welcome any contributors.

#### Current Status
This repository is only set up for development, and a lot of things are still untested and probably not working.

That said, the test application demonstrates a codecell widget, a psutil widget that polls your cpu 
(and requires the psutil library), a simple watch widget that watches expressions on the kernel, and the 
precursor to a debugger which currently allows you to crawl a post-mortem stack trace with a quickly 
scraped together UI.

Ipyng sets up a promise based api for executing and evaluating code in IPython kernels. Check out some of the test
widgets for an idea on how it works (client/codecell/codecell.js is probably a good place to start).

#### Getting Started

For now the only documentation is the source code and test application. To get started, you need node.js, bower, gulp, and
python with IPython 3. Clone the repo, cd to ipyng/gulp, cross your fingers, and run the following:
- npm install
- bower install
- gulp watch

Gulp watch will start a livereload server on port 9000, watch for changes and rebuild the app as necessary,
run a karma test server, and then crash when you add a new subdirectory (I'm still working on that bit...).

To start the python server cd to ipyng/python and run:
- python webapp.py

This will start a tornado server on localhost:8000 serving the test application.

#### Configuration

In config.yaml you can specify variables for different tasks in gulp watch. The tasks are:
- server
- lint
- html
- less
- templates
- karma
- copy

The current config.yaml abuses a lot of yaml functionality to be expressive in where
to find things while still being human readable and usable in both python and javascript.

You can create multiple config files, and specify which to run with gulp watch --config your.other.config.yaml


TODO: Create some real documentation
