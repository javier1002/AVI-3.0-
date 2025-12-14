from flask import Blueprint, render_template

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def room():
    return render_template('room.html')
#
@main_bp.route('/welcome')
def welcome():
    return render_template('welcome.html')

@main_bp.route('/sala')
def sala():
    return render_template('index.html')