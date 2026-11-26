"""One spelling per skill.

People type the same skill in different ways ("Django", "django ", "DJANGO",
"React.js", "ReactJS"). If each spelling becomes its own row in the skills
table, an employee who has "django" never matches a task that needs "Django",
and Smart Assist leaves them out.

These helpers give every name a comparison key, so the system can reuse the
skill that already exists instead of creating a second one.
"""
import difflib
import re

from .models import Skill

# Short forms that mean the same skill. The key and the value are comparison keys.
ALIASES = {
    'js': 'javascript',
    'ts': 'typescript',
    'postgres': 'postgresql',
    'py': 'python',
    'k8s': 'kubernetes',
}


def clean_name(name):
    """Trim and collapse spaces: '  Machine   learning ' -> 'Machine learning'."""
    return re.sub(r'\s+', ' ', str(name or '')).strip()


def skill_key(name):
    """Comparison key: lower case, letters/digits only (keeps + and # for C++ and C#)."""
    key = re.sub(r'[^0-9a-z+#]', '', clean_name(name).casefold())
    return ALIASES.get(key, key)


def find_existing_skill(name):
    """The skill that already has this name in any spelling, or None."""
    key = skill_key(name)
    if not key:
        return None
    for skill in Skill.objects.order_by('skill_id'):
        if skill_key(skill.name) == key:
            return skill
    return None


def similar_skill_names(name, limit=3):
    """Existing names that look like a typo of this one, e.g. 'Djnago' -> ['Django']."""
    names = {skill_key(skill.name): skill.name for skill in Skill.objects.all()}
    close = difflib.get_close_matches(skill_key(name), list(names), n=limit, cutoff=0.8)
    return [names[key] for key in close if key != skill_key(name)]


def get_or_create_skill(name):
    """Use this wherever a new skill can be added (for example "Add to the list").

    Returns (skill, created). An existing skill is reused when the name matches it
    in any spelling, so no duplicate row is created.
    """
    name = clean_name(name)
    if not name:
        raise ValueError('Enter a skill name.')
    existing = find_existing_skill(name)
    if existing is not None:
        return existing, False
    return Skill.objects.create(name=name), True