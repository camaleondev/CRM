from backend import main
import json

def main_print_routes():
    routes = [r.path for r in main.app.routes]
    print(json.dumps(routes))

if __name__ == '__main__':
    main_print_routes()
