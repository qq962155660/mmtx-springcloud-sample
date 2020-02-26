package io.mmtx.demo;



import java.net.InetSocketAddress;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import io.mmtx.demo.netty.NettyServer;


@SpringBootApplication
@EnableAutoConfiguration
public class AppServer {
	
    
	public static void main(String[] args) {
        SpringApplication.run(AppServer.class, args);
        NettyServer nettyServer = new NettyServer();
//        nettyServer.start(new InetSocketAddress("172.16.17.210", 18003));
        nettyServer.start(new InetSocketAddress("127.0.0.1", 18003));
    }
        
}
