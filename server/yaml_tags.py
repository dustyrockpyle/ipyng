__author__ = 'pyled'
import yaml


def register_tags(server_root):
    def join(loader, node):
        seq = loader.construct_sequence(node, deep=True)
        return ''.join([str(i) for i in seq])

    def root(loader, node):
        return server_root + ('' if server_root.endswith('/') else '/')

    def replace(loader, node):
        seq = loader.construct_sequence(node, deep=True)
        return [x.replace(seq[0], seq[1]) for x in seq[2]]

    def prepend(loader, node):
        seq = loader.construct_sequence(node, deep=True)
        if isinstance(seq[1], str):
            return seq[0] + seq[1]
        return [seq[0] + s for s in seq[1]]

    def flatten(loader, node):
        seq = loader.construct_sequence(node, deep=True)
        result = []
        for item in seq:
            if isinstance(item, list):
                result.extend(item)
            else:
                result.append(item)
        return result

    yaml.add_constructor('!join', join)
    yaml.add_constructor('!root', root)
    yaml.add_constructor('!replace', replace)
    yaml.add_constructor('!prepend', prepend)
    yaml.add_constructor('!flatten', flatten)