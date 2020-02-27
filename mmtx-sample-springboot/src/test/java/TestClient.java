import java.util.Random;
import java.util.concurrent.TimeUnit;

import io.netty.bootstrap.Bootstrap;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelHandler;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoop;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioSocketChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import io.netty.handler.codec.LengthFieldPrepender;
import io.netty.handler.codec.string.StringDecoder;
import io.netty.handler.codec.string.StringEncoder;
import io.netty.handler.timeout.IdleState;
import io.netty.handler.timeout.IdleStateEvent;
import io.netty.util.concurrent.Future;
import io.netty.util.concurrent.GenericFutureListener;
import io.netty.util.concurrent.ScheduledFuture;

public class TestClient {
	
	 public static void main(String[] args) {
	        TestClient tcpClient = new TestClient("47.97.103.128", 18003);
	        tcpClient.connect();
	    }
	 
	private String host;
    private int port;
    private Bootstrap bootstrap;
    private RetryPolicy retryPolicy;
    /** 将<code>Channel</code>保存起来, 可用于在其他非handler的地方发送数据 */
    private Channel channel;

    public TestClient(String host, int port) {
        this(host, port, new RetryPolicy(1000, Integer.MAX_VALUE, 60 * 1000));
    }

    public TestClient(String host, int port, RetryPolicy retryPolicy) {
        this.host = host;
        this.port = port;
        EventLoopGroup group = new NioEventLoopGroup();
        // bootstrap 可重用, 只需在TcpClient实例化的时候初始化即可.
        bootstrap = new Bootstrap();
        bootstrap.group(group)
                .channel(NioSocketChannel.class)
                .handler(new ClientInitializer(TestClient.this));
    }

    /**
     * 向远程TCP服务器请求连接
     */
    public void connect() {
        synchronized (bootstrap) {
            ChannelFuture future = bootstrap.connect(host, port);
            this.channel = future.channel();
        }
    }
    
    public RetryPolicy getRetryPolicy() {
        return retryPolicy;
    }

 

   
}

/**
 * 心跳发送
 * 
 * @author pc0062
 *
 */
class Pinger extends ChannelInboundHandlerAdapter {
	private static final String ACK = "0";
	private Random random = new Random();
	private int bound = 8;
	private Channel channel;

	@Override
	public void channelActive(ChannelHandlerContext ctx) throws Exception {
		super.channelActive(ctx);
		this.channel = ctx.channel();
		// 心跳发送
		int second = Math.max(1, random.nextInt(bound));
//		int second = 10;
		ping(second);
	}

	private void ping(int second) {
		ScheduledFuture<?> future = channel.eventLoop().schedule(new Runnable() {

			@Override
			public void run() {
				if (channel.isActive()) {
					channel.writeAndFlush(ACK);
				} else {
					System.err.println("channel is not active,cancel send a heat beat");
					channel.closeFuture();
					throw new RuntimeException();
				}
			}
		}, second, TimeUnit.SECONDS);

		future.addListener(new GenericFutureListener() {
			@Override
			public void operationComplete(Future nFuture) throws Exception {
				if (nFuture.isSuccess()) {
					ping(second);
				}
			}
		});
	}

	 @Override
	 public void channelRead(ChannelHandlerContext ctx, Object msg) throws
	 Exception {
		 if(!msg.toString().equals("ack")){
			 System.out.println("客户端收到消息:" + msg.toString());	 
		 }
		 
	 }

	@Override
	public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
		cause.printStackTrace();
		ctx.close();
	}

}

/**
 * 用于捕获{@link IdleState#WRITER_IDLE}事件（未在指定时间内向服务器发送数据），然后向<code>Server</code>端发送一个心跳包
 * 
 * @author pc0062
 *
 */

class ClientIdleStateTrigger extends ChannelInboundHandlerAdapter {
	public static final String HEART_BEAT = "heart beat!";

	@Override
	public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
		if (evt instanceof IdleStateEvent) {
			IdleState state = ((IdleStateEvent) evt).state();
			if (state == IdleState.WRITER_IDLE) {
				// write heartbeat to server
				ctx.writeAndFlush(HEART_BEAT);
			}
		} else {
			super.userEventTriggered(ctx, evt);
		}
	}
}

class ClientInitializer extends ChannelInitializer<SocketChannel> {
	private ReconnectHandler reconnectHandler;
	private EchoHandler echoHandler;

	public ClientInitializer(TestClient tcpClient) {
		this.reconnectHandler = new ReconnectHandler(tcpClient);
		this.echoHandler = new EchoHandler();
	}

	@Override
	protected void initChannel(SocketChannel socketChannel) throws Exception {
		socketChannel.pipeline().addLast(new LengthFieldBasedFrameDecoder(Integer.MAX_VALUE, 0, 4, 0, 4));
		socketChannel.pipeline().addLast(new LengthFieldPrepender(4));
		socketChannel.pipeline().addLast("decoder", new StringDecoder());
		socketChannel.pipeline().addLast("encoder", new StringEncoder());
		socketChannel.pipeline().addLast(new Pinger());
	}
}

@ChannelHandler.Sharable
class ReconnectHandler extends ChannelInboundHandlerAdapter {

	private int retries = 0;
	private RetryPolicy retryPolicy;

	private TestClient tcpClient;

	public ReconnectHandler(TestClient tcpClient) {
		this.tcpClient = tcpClient;
	}

	@Override
	public void channelActive(ChannelHandlerContext ctx) throws Exception {
		System.out.println("Successfully established a connection to the server.");
		retries = 0;
		ctx.fireChannelActive();
	}

	@Override
	public void channelInactive(ChannelHandlerContext ctx) throws Exception {
		if (retries == 0) {
			System.err.println("Lost the TCP connection with the server.");
			ctx.close();
		}

		boolean allowRetry = getRetryPolicy().allowRetry(retries);
		if (allowRetry) {

			long sleepTimeMs = getRetryPolicy().getSleepTimeMs(retries);

			System.out.println(String.format("Try to reconnect to the server after %dms. Retry count: %d.", sleepTimeMs,
					++retries));

			final EventLoop eventLoop = ctx.channel().eventLoop();
			eventLoop.schedule(() -> {
				System.out.println("Reconnecting ...");
				tcpClient.connect();
			}, sleepTimeMs, TimeUnit.MILLISECONDS);
		}
		ctx.fireChannelInactive();
	}

	private RetryPolicy getRetryPolicy() {
		if (this.retryPolicy == null) {
			this.retryPolicy = tcpClient.getRetryPolicy();
		}
		return this.retryPolicy;
	}
}

class RetryPolicy {
	private static final int MAX_RETRIES_LIMIT = 29;
	private static final int DEFAULT_MAX_SLEEP_MS = Integer.MAX_VALUE;

	private final Random random = new Random();
	private final long baseSleepTimeMs;
	private final int maxRetries;
	private final int maxSleepMs;

	public RetryPolicy(int baseSleepTimeMs, int maxRetries) {
		this(baseSleepTimeMs, maxRetries, DEFAULT_MAX_SLEEP_MS);
	}

	public RetryPolicy(int baseSleepTimeMs, int maxRetries, int maxSleepMs) {
		this.maxRetries = maxRetries;
		this.baseSleepTimeMs = baseSleepTimeMs;
		this.maxSleepMs = maxSleepMs;
	}

	public boolean allowRetry(int retryCount) {
		if (retryCount < maxRetries) {
			return true;
		}
		return false;
	}

	public long getSleepTimeMs(int retryCount) {
		if (retryCount < 0) {
			throw new IllegalArgumentException("retries count must greater than 0.");
		}
		if (retryCount > MAX_RETRIES_LIMIT) {
			System.out
					.println(String.format("maxRetries too large (%d). Pinning to %d", maxRetries, MAX_RETRIES_LIMIT));
			retryCount = MAX_RETRIES_LIMIT;
		}
		long sleepMs = baseSleepTimeMs * Math.max(1, random.nextInt(1 << retryCount));
		if (sleepMs > maxSleepMs) {
			System.out.println(String.format("Sleep extension too large (%d). Pinning to %d", sleepMs, maxSleepMs));
			sleepMs = maxSleepMs;
		}
		return sleepMs;
	}
}

@ChannelHandler.Sharable
class EchoHandler extends SimpleChannelInboundHandler<String> {

	@Override
	protected void channelRead0(ChannelHandlerContext ctx, String data) throws Exception {
		try {
			System.out.println("receive data from server: " + data);
		} catch (Exception e) {
			e.printStackTrace();
		}
	}

	@Override
	public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
		cause.printStackTrace();
		ctx.close();
	}
}