"""The contract itself, asked from node: tests/unit/oracle.mjs runs this with python3 and a JSON request on stdin.

A stub stands in for the GenLayer runtime (no network, nothing installed), contracts/tender.py is loaded
as it is, and only its pure parts are asked: rules(), the commitment, the fingerprint, the mask readers and the readers of the doors. The answer is
one JSON object on stdout.
"""

import importlib.util
import json
import pathlib
import sys
import types

# The runtime stub, written to the GenVM v0.4 API: `import genlayer as gl`, `genlayer.types`, `genlayer.storage`.
gl_mod = types.ModuleType("genlayer")
types_mod = types.ModuleType("genlayer.types")
storage_mod = types.ModuleType("genlayer.storage")


class _UserError(Exception):
    def __init__(self, data=""):
        super().__init__(data)
        self.data = data


class _Public:
    view = staticmethod(lambda f: f)

    class _Write:
        def __call__(self, f): return f
        payable = staticmethod(lambda f: f)
    write = _Write()


class _T:
    def __init__(self, *a, **k): pass
    def __class_getitem__(cls, item): return cls


class _Contract:
    pass


types_mod.Address = str
types_mod.u256 = int
types_mod.u64 = int
types_mod.u32 = int
types_mod.__all__ = ["Address", "u256", "u64", "u32"]
storage_mod.TreeMap = _T
storage_mod.allow = lambda c: c
gl_mod.types = types_mod
gl_mod.storage = storage_mod
gl_mod.public = _Public()
gl_mod.contract = types.SimpleNamespace(Contract=_Contract)
gl_mod.vm = types.SimpleNamespace(UserError=_UserError, Return=object, Result=object, run_nondet=None)
gl_mod.nondet = types.SimpleNamespace(exec_prompt=None)
gl_mod.chain = types.SimpleNamespace(Account=None)
gl_mod.message = types.SimpleNamespace(sender_address="", value=0, contract_address="", raw={})
sys.modules["genlayer"] = gl_mod
sys.modules["genlayer.types"] = types_mod
sys.modules["genlayer.storage"] = storage_mod

SRC = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "tender.py"
spec = importlib.util.spec_from_file_location("tender", SRC)
td = importlib.util.module_from_spec(spec)
sys.modules["tender"] = td
spec.loader.exec_module(td)

ask = json.loads(sys.stdin.read() or "{}")
out = {}
if ask.get("rules"):
    out["rules"] = json.loads(td.Tenders.rules(None))
out["commitment"] = [td._commitment(int(p), r, s) for p, r, s in ask.get("commitment", [])]
out["fingerprint"] = [td._fingerprint(q, p, n, s) for q, p, n, s in ask.get("fingerprint", [])]
out["text_problem"] = [td._text_problem(r, a, b, w) for r, a, b, w in ask.get("text_problem", [])]
out["requirements_of"] = [list(td._requirements_of(r)) for r in ask.get("requirements_of", [])]
out["is_salt"] = [td._is_salt(r) for r in ask.get("is_salt", [])]
out["digest_of"] = [td._digest_of(r) for r in ask.get("digest_of", [])]
out["meets_all"] = [td._meets_all(m, c) for m, c in ask.get("meets_all", [])]
out["misses_any"] = [td._misses_any(m) for m in ask.get("misses_any", [])]
out["clean_mask"] = [td._clean_mask(m, c) for m, c in ask.get("clean_mask", [])]
out["constants"] = {k: getattr(td, k) for k in ask.get("constants", [])}
sys.stdout.write(json.dumps(out))
