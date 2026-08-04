import factory
import random
from datetime import datetime, timedelta
from geoalchemy2 import WKTElement

from api.v1.users.models import User
from api.v1.orders.models import Order, OrderProposal, OrderStatus
from api.v1.chat.models import Chat, Message
from core.auth import get_password_hash


class UserFactory(factory.Factory):
	"""Фабрика для создания пользователей"""
	
	class Meta:
		model = User
	
	email = factory.Sequence(lambda n: f"user{n}@test.com")
	username = factory.Sequence(lambda n: f"user{n}")
	phone_number = factory.Sequence(lambda n: f"+7999{n:07d}")
	hashed_password = factory.LazyFunction(lambda: get_password_hash("Password123"))
	is_admin = False


class OrderFactory(factory.Factory):
	"""Фабрика для создания заказов с PostGIS Geometry"""
	
	class Meta:
		model = Order
	
	title = factory.Faker("sentence", nb_words=4)
	description = factory.Faker("paragraph", nb_sentences=3)
	min_price = factory.LazyFunction(lambda: round(random.uniform(1000, 5000), 2))
	max_price = factory.LazyAttribute(lambda o: round(o.min_price + random.uniform(1000, 5000), 2))
	deadline = factory.LazyFunction(lambda: datetime.now() + timedelta(days=7))
	address = factory.Faker("address")
	tree_type = factory.Iterator(["береза", "сосна", "ель", "дуб", "клен"])
	tree_height = factory.LazyFunction(lambda: round(random.uniform(3, 30), 1))
	tree_diameter = factory.LazyFunction(lambda: round(random.uniform(20, 150), 1))
	photos = factory.LazyFunction(lambda: ["https://example.com/photo1.jpg"])
	status = OrderStatus.OPEN
	
	# PostGIS Geometry: формат POINT(lon lat), координаты в районе Москвы
	location = factory.LazyFunction(
		lambda: WKTElement(f"POINT({random.uniform(37.5, 37.8)} {random.uniform(55.6, 55.9)})", srid=4326)
	)
	
	customer = factory.SubFactory(UserFactory)


class OrderProposalFactory(factory.Factory):
	"""Фабрика для создания предложений исполнителей"""
	
	class Meta:
		model = OrderProposal
	
	proposed_price = factory.LazyFunction(lambda: round(random.uniform(2000, 10000), 2))
	message = factory.Faker("sentence", nb_words=10)
	
	order = factory.SubFactory(OrderFactory)
	executor = factory.SubFactory(UserFactory)


class ChatFactory(factory.Factory):
	"""Фабрика для создания чатов"""
	
	class Meta:
		model = Chat
	
	is_active = True
	
	order = factory.SubFactory(OrderFactory)
	customer = factory.SelfAttribute("order.customer")
	
	# Связываем proposal с тем же заказом, что и чат
	proposal = factory.SubFactory(
		OrderProposalFactory,
		order=factory.SelfAttribute("..order"),
	)
	executor = factory.SelfAttribute("proposal.executor")


class MessageFactory(factory.Factory):
	"""Фабрика для создания сообщений"""
	
	class Meta:
		model = Message
	
	text = factory.Faker("sentence", nb_words=8)
	is_read = False
	
	chat = factory.SubFactory(ChatFactory)
	sender = factory.SubFactory(UserFactory)



async def create_user_with_orders(db_session, num_orders=0):
	"""Создает пользователя с заказами"""
	user = UserFactory()
	db_session.add(user)
	await db_session.flush()
	
	orders = []
	for _ in range(num_orders):
		order = OrderFactory(customer=user)
		db_session.add(order)
		orders.append(order)
	
	await db_session.flush()
	return user, orders


async def create_order_with_proposals(db_session, num_proposals=0):
	"""Создает заказ с предложениями от разных исполнителей"""
	order = OrderFactory()
	db_session.add(order)
	await db_session.flush()
	
	proposals = []
	for i in range(num_proposals):
		# Каждый исполнитель должен быть уникальным
		executor = UserFactory(email=f"executor{i}_{random.randint(1000, 9999)}@test.com")
		db_session.add(executor)
		await db_session.flush()
		
		proposal = OrderProposalFactory(order=order, executor=executor)
		db_session.add(proposal)
		proposals.append(proposal)
	
	await db_session.flush()
	return order, proposals


async def create_chat_with_messages(db_session, num_messages=0):
	"""Создает чат с сообщениями"""
	chat = ChatFactory()
	db_session.add(chat)
	await db_session.flush()
	
	messages = []
	for i in range(num_messages):
		# Чередование отправителей: заказчик, исполнитель, заказчик...
		sender = chat.customer if i % 2 == 0 else chat.executor
		message = MessageFactory(chat=chat, sender=sender)
		db_session.add(message)
		messages.append(message)
	
	await db_session.flush()
	return chat, messages