package io.mmtx.demo;



import java.net.InetSocketAddress;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import io.mmtx.demo.netty.Server;


@SpringBootApplication
@EnableAutoConfiguration
public class AppServer {
	
	private static String nettyServerHost;
	private static int nettyServerPort;
    
	@Value("${netty-inet-address}")
	private void setHost(String host){
		nettyServerHost = host;
	}
	@Value("${netty-port}")
	private void setHost(int port){
		nettyServerPort = port;
	}
	public static void main(String[] args) {
        SpringApplication.run(AppServer.class, args);
        Server nettyServer = new Server();
//        nettyServer.start(new InetSocketAddress("172.16.17.210", 18003));
        nettyServer.start(new InetSocketAddress(nettyServerHost, nettyServerPort));
    }
        
}
