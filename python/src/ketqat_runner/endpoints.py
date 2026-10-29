"""Network endpoints shared by the commands that talk to ketqat.com.

Kept in a module with no imports so that code which only needs the default
address -- argument parsers, help text -- does not pull in `urllib` and the
request machinery with it. Local catalog runs never contact a server, and the
import graph is how a test checks that.
"""

DEFAULT_BASE_URL = "https://ketqat.com"
